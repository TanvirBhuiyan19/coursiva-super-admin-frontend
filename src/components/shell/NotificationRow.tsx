import type { CSSProperties } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Notification } from '@/features/shell/api';
import { timeAgo } from '@/lib/format';
import { Dot } from '../ui/Badge';

/** One row of the notifications panel: opens its `href` (when it has one) and closes the panel. */
export function NotificationRow({
  n,
  onPick,
  className,
  style,
}: {
  n: Notification;
  onPick: () => void;
  className?: string;
  style?: CSSProperties;
}) {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      className={'notif-row' + (className ? ` ${className}` : '')}
      style={style}
      disabled={!n.href}
      onClick={() => {
        if (n.href) void navigate(n.href);
        onPick();
      }}
    >
      <Dot tone={n.read ? 'flat' : n.tone} style={{ position: 'relative', top: -1 }} />
      <span style={{ flex: 1, lineHeight: 1.45 }}>{n.text}</span>
      <span className="faint" style={{ fontSize: 11, flexShrink: 0 }}>
        {timeAgo(n.createdAt)}
      </span>
    </button>
  );
}
