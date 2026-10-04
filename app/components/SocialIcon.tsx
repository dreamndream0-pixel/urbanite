// 名片頁社群圖示(統一細線條風格)
export default function SocialIcon({ type, size = 20 }: { type: string; size?: number }) {
  const p = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (type) {
    case 'instagram':
      return (<svg {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.3" cy="6.7" r="0.6" fill="currentColor" /></svg>);
    case 'facebook':
      return (<svg {...p}><path d="M14.5 8H17V4.5h-2.5A4 4 0 0 0 10.5 8.5V11H8v3.5h2.5V20H14v-5.5h2.6l.4-3.5h-3V8.9c0-.5.4-.9.9-.9z" /></svg>);
    case 'line':
      return (<svg {...p}><path d="M12 4C7 4 3 7.2 3 11.2c0 3.6 3.2 6.6 7.6 7.1.3.1.7.2.8.5.1.3 0 .6 0 .9l-.1.8c0 .3-.2 1 .9.5s5.8-3.4 7.9-5.9c1.4-1.6 2-3.2 2-4.9C21 7.2 17 4 12 4z" /><path d="M7.5 9.5v3.5h2M11.5 9.5V13M13.5 13V9.5l2.5 3.5V9.5" /></svg>);
    case 'threads':
      return (<svg {...p}><path d="M16.5 11.2c-.3-2.4-1.8-3.7-4.3-3.7-2.2 0-3.6 1.2-4 3" /><path d="M16.6 11.5c-1.2-.6-2.6-.8-4-.7-2.1.2-3.4 1.2-3.3 2.6.1 1.3 1.4 2 2.9 1.9 2.3-.1 3.5-1.8 3.6-5" /><path d="M18.5 8.2C17.3 5.4 15 4 12 4 7.4 4 4.5 7.3 4.5 12s2.9 8 7.5 8c3.5 0 5.9-1.8 6.6-4.2.6-2.1-.3-3.6-2-4.3" /></svg>);
    case 'youtube':
      return (<svg {...p}><rect x="2.5" y="5.5" width="19" height="13" rx="4" /><path d="M10.5 9.5v5l4-2.5z" /></svg>);
    case 'tiktok':
      return (<svg {...p}><path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5" /><path d="M14 4c.4 2.4 2 4 4.5 4.3" /></svg>);
    case 'pinterest':
      return (<svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M10.8 20.3l1.7-7.3M10.5 13.6c.4 1 1.3 1.6 2.4 1.6 2 0 3.4-1.9 3.4-4.3 0-2.3-1.9-4-4.3-4-2.9 0-4.6 2-4.6 4.2 0 1 .4 2 1.2 2.4" /></svg>);
    case 'x':
      return (<svg {...p}><path d="M5 4.5l14 15M19 4.5l-14 15" /></svg>);
    case 'xiaohongshu':
      return (<svg {...p}><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><path d="M8 9v6M10.5 9v3.5c0 1.4-.6 2.5-1.5 2.5M14 9h2.5M15.2 9v6M13.5 12h3.5" /></svg>);
    default:
      return (<svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.6 3.5 5.4 3.5 8.5s-1.1 5.9-3.5 8.5c-2.4-2.6-3.5-5.4-3.5-8.5s1.1-5.9 3.5-8.5z" /></svg>);
  }
}
