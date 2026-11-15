use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::net::TcpStream;
use std::time::Duration;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Windows 作业对象封装：启用 `JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE`，
/// 确保主程序意外退出、崩溃或被更新安装器强杀时，内核自动清理所有子孙进程（如 llama-server 模型工作进程）。
#[cfg(windows)]
mod win_job {
    use std::ffi::c_void;
    use std::process::Child;
    use std::os::windows::io::AsRawHandle;

    type Handle = *mut c_void;
    const JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS: i32 = 9;
    const JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: u32 = 0x0000_2000;

    #[repr(C)]
    #[derive(Default)]
    struct JobObjectBasicLimitInformation {
        per_process_user_time_limit: i64,
        per_job_user_time_limit: i64,
        limit_flags: u32,
        minimum_working_set_size: usize,
        maximum_working_set_size: usize,
        active_process_limit: u32,
        affinity: usize,
        priority_class: u32,
        scheduling_class: u32,
    }

    #[repr(C)]
    #[derive(Default)]
    struct IoCounters {
        read_operation_count: u64,
        write_operation_count: u64,
        other_operation_count: u64,
        read_transfer_count: u64,
        write_transfer_count: u64,
        other_transfer_count: u64,
    }

    #[repr(C)]
    #[derive(Default)]
    struct JobObjectExtendedLimitInformation {
        basic_limit_information: JobObjectBasicLimitInformation,
        io_info: IoCounters,
        process_memory_limit: usize,
        job_memory_limit: usize,
        peak_process_memory_used: usize,
        peak_job_memory_used: usize,
    }

    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn CreateJobObjectW(lp_job_attributes: *const c_void, lp_name: *const u16) -> Handle;
        fn SetInformationJobObject(
            h_job: Handle,
            job_object_information_class: i32,
            lp_job_object_information: *const c_void,
            cb_job_object_information_length: u32,
        ) -> i32;
        fn AssignProcessToJobObject(h_job: Handle, h_process: Handle) -> i32;
        fn CloseHandle(h_object: Handle) -> i32;
    }

    pub struct WinJobObject {
        handle: Handle,
    }

    // Win32 Job Object 句柄可跨线程安全传递与引用
    unsafe impl Send for WinJobObject {}
    unsafe impl Sync for WinJobObject {}

    impl WinJobObject {
        pub fn new() -> Option<Self> {
            unsafe {
                let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
                if handle.is_null() {
                    return None;
                }
                let mut info = JobObjectExtendedLimitInformation::default();
                info.basic_limit_information.limit_flags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
                let ok = SetInformationJobObject(
                    handle,
                    JOB_OBJECT_EXTENDED_LIMIT_INFORMATION_CLASS,
                    (&raw const info).cast(),
                    std::mem::size_of::<JobObjectExtendedLimitInformation>() as u32,
                );
                if ok == 0 {
                    CloseHandle(handle);
                    return None;
                }
                Some(Self { handle })
            }
        }

        pub fn assign(&self, child: &Child) -> bool {
            unsafe { AssignProcessToJobObject(self.handle, child.as_raw_handle() as Handle) != 0 }
        }
    }

    impl Drop for WinJobObject {
        fn drop(&mut self) {
            if !self.handle.is_null() {
                unsafe {
                    CloseHandle(self.handle);
                }
            }
        }
    }
}

#[derive(Clone, Default, serde::Serialize)]
pub struct ServiceStatusInfo {
    pub llama_running: bool,
    pub llama_managed: bool,
    pub asr_running: bool,
    pub asr_managed: bool,
}

pub struct ServiceManager {
    llama_child: Arc<Mutex<Option<Child>>>,
    asr_child: Arc<Mutex<Option<Child>>>,
    status: Arc<Mutex<ServiceStatusInfo>>,
    #[cfg(windows)]
    job_object: Option<win_job::WinJobObject>,
}

impl ServiceManager {
    pub fn new() -> Self {
        Self {
            llama_child: Arc::new(Mutex::new(None)),
            asr_child: Arc::new(Mutex::new(None)),
            status: Arc::new(Mutex::new(ServiceStatusInfo::default())),
            #[cfg(windows)]
            job_object: win_job::WinJobObject::new(),
        }
    }

    /// 检测指定端口是否已有服务在监听
    pub fn is_port_listening(port: u16) -> bool {
        TcpStream::connect_timeout(
            &format!("127.0.0.1:{}", port).parse().unwrap(),
            Duration::from_millis(300),
        )
        .is_ok()
    }

    /// 检测目录是否包含真实可用的 GGUF 模型权重（排除 llama.cpp 源码自带的 ggml-vocab-* 词表测试文件）
    #[cfg(target_os = "windows")]
    fn has_valid_gguf_models(dir: &std::path::Path) -> bool {
        if !dir.is_dir() {
            return false;
        }
        if dir.join("models-preset.ini").is_file() {
            return true;
        }
        std::fs::read_dir(dir)
            .map(|mut entries| {
                entries.any(|e| {
                    e.map(|entry| {
                        let p = entry.path();
                        let is_gguf = p
                            .extension()
                            .and_then(|ext| ext.to_str())
                            .map(|ext| ext.eq_ignore_ascii_case("gguf"))
                            .unwrap_or(false);
                        if !is_gguf {
                            return false;
                        }
                        let name = p
                            .file_name()
                            .and_then(|n| n.to_str())
                            .unwrap_or("")
                            .to_ascii_lowercase();
                        !name.starts_with("ggml-vocab-") && !name.starts_with("for-tests-")
                    })
                    .unwrap_or(false)
                })
            })
            .unwrap_or(false)
    }

    /// 跨平台自动探测 llama-server 二进制、模型目录及预设配置文件
    pub fn detect_llama_paths() -> (Option<PathBuf>, Option<PathBuf>, Option<PathBuf>, Option<PathBuf>) {
        let mut binary: Option<PathBuf> = None;
        let mut work_dir: Option<PathBuf> = None;
        let mut models_dir: Option<PathBuf> = None;
        let mut preset_file: Option<PathBuf> = None;

        #[cfg(target_os = "macos")]
        {
            if let Ok(home) = std::env::var("HOME") {
                let home_path = PathBuf::from(home);

                let bin_candidates = [
                    home_path.join("llama.cpp/build/bin/llama-server"),
                    home_path.join("llama.cpp/llama-server"),
                    PathBuf::from("/usr/local/bin/llama-server"),
                    PathBuf::from("/opt/homebrew/bin/llama-server"),
                ];
                for b in bin_candidates {
                    if b.is_file() {
                        binary = Some(b);
                        break;
                    }
                }

                let llama_candidate = home_path.join("llama.cpp");
                if llama_candidate.is_dir() {
                    work_dir = Some(llama_candidate);
                }

                let models_candidate = home_path.join("models");
                if models_candidate.is_dir() {
                    models_dir = Some(models_candidate);
                }

                let preset_candidate = home_path.join("llama.cpp/models-preset.ini");
                if preset_candidate.is_file() {
                    preset_file = Some(preset_candidate);
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            let mut search_dirs = Vec::new();

            // 1. 优先读取用户自定义环境变量
            if let Ok(custom) = std::env::var("LLAMA_DIR") {
                search_dirs.push(PathBuf::from(custom));
            }
            if let Ok(userprofile) = std::env::var("USERPROFILE") {
                let u_path = PathBuf::from(userprofile);
                search_dirs.push(u_path.join("llama.cpp"));
                search_dirs.push(u_path.join("models"));
            }

            // 2. 扫描常用盘符根目录 (C:, D:, E:)
            for drive in ["C", "D", "E"] {
                search_dirs.push(PathBuf::from(format!(r"{}:\llama.cpp", drive)));
                search_dirs.push(PathBuf::from(format!(r"{}:\models", drive)));
                search_dirs.push(PathBuf::from(format!(r"{}:\AI\llama.cpp", drive)));
                search_dirs.push(PathBuf::from(format!(r"{}:\AI\models", drive)));
                search_dirs.push(PathBuf::from(format!(r"{}:\tools\llama.cpp", drive)));
            }

            // 探测 llama-server.exe 二进制
            for dir in &search_dirs {
                let candidates = [
                    dir.join("llama-server.exe"),
                    dir.join(r"build-vs2022\bin\Release\llama-server.exe"),
                    dir.join(r"build\bin\Release\llama-server.exe"),
                    dir.join(r"build\bin\llama-server.exe"),
                ];
                for c in candidates {
                    if c.is_file() {
                        binary = Some(c);
                        work_dir = Some(dir.clone());
                        break;
                    }
                }
                if binary.is_some() {
                    break;
                }
            }

            // 探测模型权重目录（优先独立 models 目录，其次才是 llama.cpp\models，且排除仅含 ggml-vocab-* 的源码测试目录）
            if let Ok(custom_models) = std::env::var("MODELS_DIR") {
                let cm = PathBuf::from(custom_models);
                if cm.is_dir() {
                    models_dir = Some(cm);
                }
            }
            if models_dir.is_none() {
                let mut model_candidates = Vec::new();
                if let Ok(userprofile) = std::env::var("USERPROFILE") {
                    model_candidates.push(PathBuf::from(userprofile).join("models"));
                }
                for drive in ["C", "D", "E"] {
                    model_candidates.push(PathBuf::from(format!(r"{}:\models", drive)));
                    model_candidates.push(PathBuf::from(format!(r"{}:\AI\models", drive)));
                }
                if let Ok(custom) = std::env::var("LLAMA_DIR") {
                    model_candidates.push(PathBuf::from(custom).join("models"));
                }
                if let Ok(userprofile) = std::env::var("USERPROFILE") {
                    model_candidates.push(PathBuf::from(userprofile).join(r"llama.cpp\models"));
                }
                for drive in ["C", "D", "E"] {
                    model_candidates.push(PathBuf::from(format!(r"{}:\llama.cpp\models", drive)));
                    model_candidates.push(PathBuf::from(format!(r"{}:\AI\llama.cpp\models", drive)));
                    model_candidates.push(PathBuf::from(format!(r"{}:\tools\llama.cpp\models", drive)));
                }

                for c in model_candidates {
                    if Self::has_valid_gguf_models(&c) {
                        models_dir = Some(c);
                        break;
                    }
                }
            }

            // 探测 models-preset.ini 预设文件
            for dir in &search_dirs {
                let candidates = [
                    dir.join("models-preset.ini"),
                    dir.join(r"models\models-preset.ini"),
                ];
                for p in candidates {
                    if p.is_file() {
                        preset_file = Some(p);
                        break;
                    }
                }
                if preset_file.is_some() {
                    break;
                }
            }
        }

        (binary, work_dir, models_dir, preset_file)
    }

    /// 获取本地 ASR 语音模型服务的启动命令（SenseVoice / FastAPI 极速服务）
    pub fn get_asr_command() -> Option<Command> {
        #[cfg(target_os = "macos")]
        {
            if let Ok(home) = std::env::var("HOME") {
                let home_path = PathBuf::from(&home);
                let script_path = home_path.join("llama.cpp/scripts/asr-server.py");
                if script_path.is_file() {
                    let py_candidates = [
                        home_path.join(".venvs/main/bin/python3"),
                        PathBuf::from("/usr/local/bin/python3"),
                        PathBuf::from("/opt/homebrew/bin/python3"),
                    ];
                    let venv_dir = home_path.join(".venvs/main");
                    let default_path = format!(
                        "{}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin",
                        venv_dir.join("bin").to_string_lossy()
                    );

                    for py in py_candidates {
                        if py.is_file() {
                            let mut cmd = Command::new(py);
                            cmd.arg(&script_path);
                            cmd.current_dir(&home_path.join("llama.cpp"));
                            cmd.env("HOME", &home);
                            cmd.env("PATH", &default_path);
                            if venv_dir.is_dir() {
                                cmd.env("VIRTUAL_ENV", &venv_dir);
                            }
                            return Some(cmd);
                        }
                    }
                    let mut cmd = Command::new("python3");
                    cmd.arg(&script_path);
                    cmd.current_dir(&home_path.join("llama.cpp"));
                    cmd.env("HOME", &home);
                    cmd.env("PATH", &default_path);
                    return Some(cmd);
                }

                let bin_candidates = [
                    home_path.join("llama.cpp/sensevoice-server"),
                    home_path.join("llama.cpp/build/bin/sensevoice-server"),
                ];
                for b in bin_candidates {
                    if b.is_file() {
                        let mut cmd = Command::new(b);
                        cmd.arg("--port").arg("8000");
                        return Some(cmd);
                    }
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            let mut search_dirs = Vec::new();
            if let Ok(custom) = std::env::var("LLAMA_DIR") {
                search_dirs.push(PathBuf::from(custom));
            }
            if let Ok(userprofile) = std::env::var("USERPROFILE") {
                search_dirs.push(PathBuf::from(userprofile).join("llama.cpp"));
            }
            for drive in ["C", "D", "E"] {
                search_dirs.push(PathBuf::from(format!(r"{}:\llama.cpp", drive)));
                search_dirs.push(PathBuf::from(format!(r"{}:\AI\llama.cpp", drive)));
                search_dirs.push(PathBuf::from(format!(r"{}:\tools\llama.cpp", drive)));
            }

            for dir in search_dirs {
                let script = dir.join(r"scripts\asr-server.py");
                if script.is_file() {
                    let mut cmd = Command::new("python");
                    cmd.arg(&script);
                    cmd.current_dir(&dir);
                    return Some(cmd);
                }
                let bin = dir.join("sensevoice-server.exe");
                if bin.is_file() {
                    let mut cmd = Command::new(bin);
                    cmd.arg("--port").arg("8000");
                    cmd.current_dir(&dir);
                    return Some(cmd);
                }
            }
        }

        None
    }

    /// 启动后台 llama-server (8080)
    pub fn start_llama(&self) {
        let port = 8080;
        if Self::is_port_listening(port) {
            println!("[Tauri] 本地 8080 端口已有服务在运行，直接复用该服务。");
            let mut st = self.status.lock().unwrap();
            st.llama_running = true;
            st.llama_managed = false;
            return;
        }

        let (binary_opt, work_dir_opt, models_dir_opt, preset_opt) = Self::detect_llama_paths();
        let binary_path = match binary_opt {
            Some(b) => b,
            None => {
                println!("[Tauri] 未检测到本地已安装的 llama-server，请检查模型服务路径。");
                return;
            }
        };

        println!("[Tauri] 准备启动 llama-server: {:?}", binary_path);
        let mut cmd = Command::new(&binary_path);

        if let Some(ref w_dir) = work_dir_opt {
            cmd.current_dir(w_dir);
        }

        cmd.arg("--host").arg("0.0.0.0");
        cmd.arg("--port").arg(port.to_string());
        cmd.arg("--models-max").arg("2");
        cmd.arg("--models-autoload");

        if let Some(ref m_dir) = models_dir_opt {
            cmd.arg("--models-dir").arg(m_dir);
        }

        if let Some(ref preset) = preset_opt {
            cmd.arg("--models-preset").arg(preset);
        }

        // macOS 下注入 Vulkan 环境变量（确保独立显卡 GPU 加速顺畅加载）
        #[cfg(target_os = "macos")]
        {
            if let Ok(home) = std::env::var("HOME") {
                let home_path = PathBuf::from(home);
                let vulkan_candidates = [
                    home_path.join("VulkanSDK/1.4.363.0/macOS"),
                    home_path.join("VulkanSDK/macOS"),
                ];
                for v_mac in vulkan_candidates {
                    if v_mac.is_dir() {
                        let lib_dir = v_mac.join("lib");
                        let share_dir = v_mac.join("share/vulkan");
                        cmd.env("VULKAN_SDK", &v_mac);
                        cmd.env("DYLD_LIBRARY_PATH", &lib_dir);
                        cmd.env("VK_ADD_LAYER_PATH", share_dir.join("explicit_layer.d"));
                        cmd.env("VK_ICD_FILENAMES", share_dir.join("icd.d"));
                        cmd.env("VK_DRIVER_FILES", share_dir.join("icd.d"));

                        let old_path = std::env::var("PATH").unwrap_or_default();
                        let new_path = format!(
                            "{}:{}:/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin",
                            v_mac.join("bin").to_string_lossy(),
                            old_path
                        );
                        cmd.env("PATH", new_path);
                        break;
                    }
                }
            }
        }

        // Windows 避免弹出控制台窗口
        #[cfg(windows)]
        {
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        match cmd.spawn() {
            Ok(child_proc) => {
                println!("[Tauri] llama-server 启动成功，PID: {}", child_proc.id());
                #[cfg(windows)]
                if let Some(ref job) = self.job_object {
                    if !job.assign(&child_proc) {
                        eprintln!("[Tauri] 绑定 llama-server 到 JobObject 失败");
                    }
                }
                let mut child_guard = self.llama_child.lock().unwrap();
                *child_guard = Some(child_proc);

                let mut st = self.status.lock().unwrap();
                st.llama_running = true;
                st.llama_managed = true;
            }
            Err(e) => {
                eprintln!("[Tauri] 启动 llama-server 失败: {}", e);
            }
        }
    }

    /// 启动本地 ASR 语音模型服务 (8000)
    pub fn start_asr(&self) {
        let port = 8000;
        if Self::is_port_listening(port) {
            println!("[Tauri] 本地 8000 ASR 语音端口已有服务运行，直接复用。");
            let mut st = self.status.lock().unwrap();
            st.asr_running = true;
            st.asr_managed = false;
            return;
        }

        let mut cmd = match Self::get_asr_command() {
            Some(c) => c,
            None => {
                println!("[Tauri] 未检测到本地 ASR 服务脚本或二进制，语音服务暂不自启。");
                return;
            }
        };

        println!("[Tauri] 准备启动本地 ASR 语音服务...");

        if let Ok(log_file) = std::fs::File::create("/tmp/writingmaster-asr.log") {
            if let Ok(err_file) = log_file.try_clone() {
                cmd.stdout(log_file);
                cmd.stderr(err_file);
            }
        }

        #[cfg(windows)]
        {
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        match cmd.spawn() {
            Ok(child_proc) => {
                println!("[Tauri] ASR 语音服务启动成功，PID: {}", child_proc.id());
                #[cfg(windows)]
                if let Some(ref job) = self.job_object {
                    if !job.assign(&child_proc) {
                        eprintln!("[Tauri] 绑定 ASR 服务到 JobObject 失败");
                    }
                }
                let mut child_guard = self.asr_child.lock().unwrap();
                *child_guard = Some(child_proc);

                let mut st = self.status.lock().unwrap();
                st.asr_running = true;
                st.asr_managed = true;
            }
            Err(e) => {
                eprintln!("[Tauri] 启动 ASR 服务失败: {}", e);
            }
        }
    }

    /// 终止子进程及其派生的所有孙子进程（如 llama-server 路由模式拉起的模型工作进程）
    fn terminate_child_tree(child: &mut Child, label: &str) {
        let pid = child.id();
        println!("[Tauri] 正在终止 {} 进程树 (PID: {})...", label, pid);

        #[cfg(windows)]
        {
            // taskkill /T /F 同步杀死路由父进程及全部模型工作子进程，立即释放 GPU 显存
            let _ = Command::new("taskkill")
                .args(["/PID", &pid.to_string(), "/T", "/F"])
                .creation_flags(CREATE_NO_WINDOW)
                .output();
            let _ = child.kill();
            let _ = child.wait();
        }

        #[cfg(not(windows))]
        {
            let pid_str = pid.to_string();
            // 先发 SIGTERM 让 llama-server 路由优雅卸载子进程，超时后再强制清理进程树
            let _ = Command::new("kill").args(["-TERM", &pid_str]).output();
            for _ in 0..15 {
                if let Ok(Some(_)) = child.try_wait() {
                    return;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            let _ = Command::new("pkill").args(["-KILL", "-P", &pid_str]).output();
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    /// App 退出或更新重启前，释放所有托管的子进程树与 GPU 显存
    pub fn stop_all(&self) {
        if let Some(mut child) = self.llama_child.lock().unwrap().take() {
            Self::terminate_child_tree(&mut child, "llama-server");
        }
        if let Some(mut child) = self.asr_child.lock().unwrap().take() {
            Self::terminate_child_tree(&mut child, "ASR 语音服务");
        }
        let mut st = self.status.lock().unwrap();
        st.llama_running = false;
        st.llama_managed = false;
        st.asr_running = false;
        st.asr_managed = false;
    }

    pub fn get_status(&self) -> ServiceStatusInfo {
        let st = self.status.lock().unwrap();
        st.clone()
    }
}

impl Drop for ServiceManager {
    fn drop(&mut self) {
        self.stop_all();
    }
}

#[tauri::command]
fn get_service_status(manager: tauri::State<'_, Arc<ServiceManager>>) -> ServiceStatusInfo {
    manager.get_status()
}

#[tauri::command]
fn stop_managed_services(manager: tauri::State<'_, Arc<ServiceManager>>) {
    manager.stop_all();
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let service_manager = Arc::new(ServiceManager::new());
    let mgr_for_setup = service_manager.clone();
    let mgr_for_events = service_manager.clone();

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(service_manager)
        .invoke_handler(tauri::generate_handler![
            get_service_status,
            stop_managed_services
        ])
        .setup(move |_app| {
            // App 启动时同时尝试拉起 llama 路由服务与 ASR 语音服务
            mgr_for_setup.start_llama();
            mgr_for_setup.start_asr();
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(move |_app_handle, event| {
            match event {
                tauri::RunEvent::Exit | tauri::RunEvent::ExitRequested { .. } => {
                    mgr_for_events.stop_all();
                }
                _ => {}
            }
        });
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn win_job_object_assigns_and_kills_child_tree_on_drop() {
        let job = win_job::WinJobObject::new().expect("CreateJobObjectW / SetInformationJobObject should succeed");
        let mut child = Command::new("cmd")
            .args(["/C", "ping -n 30 127.0.0.1 >NUL"])
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .expect("spawn child");

        assert!(job.assign(&child), "AssignProcessToJobObject should succeed");
        drop(job);

        // 等待内核在 Job 句柄关闭后终止子进程
        let mut exited = false;
        for _ in 0..30 {
            if let Ok(Some(_)) = child.try_wait() {
                exited = true;
                break;
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        assert!(exited, "child process should be terminated when WinJobObject drops");
    }
}
