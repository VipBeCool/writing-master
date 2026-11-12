import React from 'react';

export type MascotMood = 'hello' | 'think' | 'write' | 'cheer' | 'sorry';

interface MascotProps {
  mood?: MascotMood;
  size?: number;
  /** 是否轻轻上下浮动（会自动遵循“减弱动效”设置） */
  bob?: boolean;
  className?: string;
}

/**
 * 吉祥物“小语”：一只爱写作文的小猫头鹰。
 * 纯 SVG、无外部资源；不同情绪切换眼睛、翅膀和手边的小道具。
 */
export const Mascot: React.FC<MascotProps> = ({ mood = 'hello', size = 120, bob = false, className = '' }) => {
  const ink = '#1f3a40';
  const happyEyes = mood === 'cheer';
  const sadEyes = mood === 'sorry';

  return (
    <svg
      viewBox="0 0 120 120"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
      className={`${bob ? 'mascot-bob' : ''} ${className}`}
    >
      {/* 地面阴影与小脚 */}
      <ellipse cx="60" cy="112" rx="28" ry="4.5" fill="#b4dadf" opacity="0.55" />
      <ellipse cx="47" cy="107" rx="8" ry="4" fill="#f2b23a" />
      <ellipse cx="73" cy="107" rx="8" ry="4" fill="#f2b23a" />

      {/* 头顶的小羽毛 */}
      <path d="M31 42 L24 21 L46 33 Z" fill="#3d8e9c" />
      <path d="M89 42 L96 21 L74 33 Z" fill="#3d8e9c" />

      {/* 身体与肚皮 */}
      <ellipse cx="60" cy="68" rx="38" ry="40" fill="#5aa7b4" />
      <ellipse cx="60" cy="82" rx="23" ry="24" fill="#eef7f8" />
      <path d="M50 78 q4 4 8 0 M62 78 q4 4 8 0 M54 90 q6 4 12 0" stroke="#b4dadf" strokeWidth="2" fill="none" strokeLinecap="round" />

      {/* 左翅膀（hello/cheer 时举起） */}
      {mood === 'cheer' ? (
        <ellipse cx="22" cy="56" rx="8.5" ry="16" transform="rotate(32 22 56)" fill="#3d8e9c" />
      ) : (
        <ellipse cx="25" cy="76" rx="8.5" ry="16" transform="rotate(14 25 76)" fill="#3d8e9c" />
      )}

      {/* 右翅膀 */}
      {mood === 'hello' || mood === 'cheer' ? (
        <ellipse cx="98" cy="56" rx="8.5" ry="16" transform="rotate(-32 98 56)" fill="#3d8e9c" />
      ) : (
        <ellipse cx="95" cy="76" rx="8.5" ry="16" transform="rotate(-14 95 76)" fill="#3d8e9c" />
      )}

      {/* 眼睛 */}
      {happyEyes ? (
        <>
          <path d="M36 57 q10 -12 20 0" stroke={ink} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M64 57 q10 -12 20 0" stroke={ink} strokeWidth="4" fill="none" strokeLinecap="round" />
        </>
      ) : sadEyes ? (
        <>
          <path d="M36 56 q10 10 20 0" stroke={ink} strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M64 56 q10 10 20 0" stroke={ink} strokeWidth="4" fill="none" strokeLinecap="round" />
        </>
      ) : (
        <>
          <circle cx="46" cy="56" r="12" fill="#fff" />
          <circle cx="74" cy="56" r="12" fill="#fff" />
          <circle cx={mood === 'think' ? 50 : 47} cy={mood === 'think' ? 52 : 57} r="5.5" fill={ink} />
          <circle cx={mood === 'think' ? 78 : 75} cy={mood === 'think' ? 52 : 57} r="5.5" fill={ink} />
          <circle cx={mood === 'think' ? 52 : 49} cy={mood === 'think' ? 50 : 55} r="1.8" fill="#fff" />
          <circle cx={mood === 'think' ? 80 : 77} cy={mood === 'think' ? 50 : 55} r="1.8" fill="#fff" />
        </>
      )}

      {/* 嘴（小黄喙）与腮红 */}
      <path d="M55 65 L65 65 L60 73 Z" fill="#f2b23a" />
      <ellipse cx="35" cy="68" rx="6" ry="4" fill="#fbbcae" opacity="0.85" />
      <ellipse cx="85" cy="68" rx="6" ry="4" fill="#fbbcae" opacity="0.85" />

      {/* 情绪道具 */}
      {mood === 'think' && (
        <g>
          <circle cx="98" cy="20" r="9" fill="#ffeabb" stroke="#f2b23a" strokeWidth="2" />
          <path d="M95 29 h6 M96 32 h4" stroke="#f2b23a" strokeWidth="2" strokeLinecap="round" />
          <path d="M98 8 v-3 M110 20 h3 M86 20 h-3 M106 12 l2 -2 M90 12 l-2 -2" stroke="#f2b23a" strokeWidth="2" strokeLinecap="round" />
        </g>
      )}
      {mood === 'write' && (
        <g transform="rotate(-28 100 82)">
          <rect x="95" y="62" width="8" height="34" rx="2" fill="#f2b23a" />
          <rect x="95" y="62" width="8" height="6" rx="2" fill="#ee7a65" />
          <path d="M95 96 L103 96 L99 105 Z" fill="#ffeabb" />
          <path d="M97.5 101 L100.5 101 L99 105 Z" fill={ink} />
        </g>
      )}
      {mood === 'cheer' && (
        <g fill="#f2b23a">
          <path d="M14 22 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5 Z" />
          <path d="M104 10 l2 4.5 4.5 2 -4.5 2 -2 4.5 -2 -4.5 -4.5 -2 4.5 -2 Z" />
          <circle cx="108" cy="36" r="2.5" fill="#ee7a65" />
          <circle cx="10" cy="46" r="2.5" fill="#5d93d6" />
        </g>
      )}
      {mood === 'sorry' && (
        <path d="M92 38 q4 8 0 11 q-4 -3 0 -11 Z" fill="#aecbee" />
      )}
    </svg>
  );
};

