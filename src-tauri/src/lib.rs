use std::path::PathBuf;
use std::process::{Child, Command};
use std::sync::{Arc, Mutex};
use std::net::TcpStream;
use std::time::Duration;

#[cfg(windows)]
use std::os::windows::process::CommandExt;

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
}

impl ServiceManager {
    pub fn new() -> Self {
        Self {
            llama_child: Arc::new(Mutex::new(None)),
            asr_child: Arc::new(Mutex::new(None)),
            status: Arc::new(Mutex::new(ServiceStatusInfo::default())),
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
            let bin_candidates = [
                PathBuf::from(r"C:\llama.cpp\llama-server.exe"),
                PathBuf::from(r"C:\llama.cpp\build\bin\Release\llama-server.exe"),
                PathBuf::from(r"C:\tools\llama.cpp\llama-server.exe"),
                PathBuf::from(r"C:\models\llama-server.exe"),
            ];
            for b in bin_candidates {
                if b.is_file() {
                    binary = Some(b);
                    break;
                }
            }

            let work_candidate = PathBuf::from(r"C:\llama.cpp");
            if work_candidate.is_dir() {
                work_dir = Some(work_candidate);
            }

            let models_candidates = [
                PathBuf::from(r"C:\models"),
                PathBuf::from(r"C:\llama.cpp\models"),
            ];
            for m in models_candidates {
                if m.is_dir() {
                    models_dir = Some(m);
                    break;
                }
            }

            let preset_candidates = [
                PathBuf::from(r"C:\llama.cpp\models-preset.ini"),
                PathBuf::from(r"C:\models\models-preset.ini"),
            ];
            for p in preset_candidates {
                if p.is_file() {
                    preset_file = Some(p);
                    break;
                }
            }
        }

        (binary, work_dir, models_dir, preset_file)
    }

    /// 探测本地 ASR 语音模型服务（SenseVoice / Whisper 等）
    pub fn detect_asr_paths() -> (Option<PathBuf>, Option<PathBuf>) {
        let mut binary: Option<PathBuf> = None;
        let mut model_file: Option<PathBuf> = None;

        #[cfg(target_os = "macos")]
        {
            if let Ok(home) = std::env::var("HOME") {
                let home_path = PathBuf::from(home);
                let candidates = [
                    home_path.join("llama.cpp/sensevoice-server"),
                    home_path.join("llama.cpp/build/bin/sensevoice-server"),
                    home_path.join("llama.cpp/whisper-server"),
                    PathBuf::from("/usr/local/bin/sensevoice-server"),
                ];
                for c in candidates {
                    if c.is_file() {
                        binary = Some(c);
                        break;
                    }
                }

                let model_candidates = [
                    home_path.join("models/sensevoice-small-q8.gguf"),
                    home_path.join("models/sensevoice-small.gguf"),
                ];
                for m in model_candidates {
                    if m.is_file() {
                        model_file = Some(m);
                        break;
                    }
                }
            }
        }

        #[cfg(target_os = "windows")]
        {
            let candidates = [
                PathBuf::from(r"C:\llama.cpp\sensevoice-server.exe"),
                PathBuf::from(r"C:\models\sensevoice-server.exe"),
            ];
            for c in candidates {
                if c.is_file() {
                    binary = Some(c);
                    break;
                }
            }

            let model_candidates = [
                PathBuf::from(r"C:\models\sensevoice-small-q8.gguf"),
                PathBuf::from(r"C:\llama.cpp\models\sensevoice-small-q8.gguf"),
            ];
            for m in model_candidates {
                if m.is_file() {
                    model_file = Some(m);
                    break;
                }
            }
        }

        (binary, model_file)
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
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        match cmd.spawn() {
            Ok(child_proc) => {
                println!("[Tauri] llama-server 启动成功，PID: {}", child_proc.id());
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

        let (binary_opt, model_opt) = Self::detect_asr_paths();
        let (binary_path, model_path) = match (binary_opt, model_opt) {
            (Some(b), Some(m)) => (b, m),
            _ => {
                println!("[Tauri] 未检测到配套的本地 ASR 二进制程序，语音服务暂不自启。");
                return;
            }
        };

        println!("[Tauri] 准备启动本地 ASR 语音服务: {:?}", binary_path);
        let mut cmd = Command::new(&binary_path);
        cmd.arg("-m").arg(&model_path);
        cmd.arg("--port").arg(port.to_string());

        #[cfg(windows)]
        {
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            cmd.creation_flags(CREATE_NO_WINDOW);
        }

        match cmd.spawn() {
            Ok(child_proc) => {
                println!("[Tauri] ASR 语音服务启动成功，PID: {}", child_proc.id());
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

    /// App 退出时，释放所有管理的子进程与显存
    pub fn stop_all(&self) {
        if let Some(mut child) = self.llama_child.lock().unwrap().take() {
            println!("[Tauri] 正在退出应用，终止 llama-server 释放 GPU 显存...");
            let _ = child.kill();
            let _ = child.wait();
        }
        if let Some(mut child) = self.asr_child.lock().unwrap().take() {
            println!("[Tauri] 终止本地 ASR 语音服务...");
            let _ = child.kill();
            let _ = child.wait();
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

#[tauri::command]
fn get_service_status(manager: tauri::State<'_, Arc<ServiceManager>>) -> ServiceStatusInfo {
    manager.get_status()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let service_manager = Arc::new(ServiceManager::new());
    let mgr_for_setup = service_manager.clone();
    let mgr_for_events = service_manager.clone();

    tauri::Builder::default()
        .manage(service_manager)
        .invoke_handler(tauri::generate_handler![get_service_status])
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
