import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Drawer, Modal } from './Overlay';

const meta = {
  title: 'UI/Overlay',
  component: Modal,
  args: { label: 'Suspend tenant', onClose: () => {}, children: null },
} satisfies Meta<typeof Modal>;
export default meta;
type Story = StoryObj<typeof meta>;

function Demo({ kind }: { kind: 'modal' | 'drawer' }) {
  const [open, setOpen] = useState(true);
  const body = (
    <div style={{ padding: 20 }}>
      <h2 className="t-lg" style={{ marginTop: 0 }}>
        Suspend Amplify Coaching?
      </h2>
      <p className="t-sm muted">Learners lose access immediately. You can reactivate at any time.</p>
      <div className="hstack" style={{ justifyContent: 'flex-end', gap: 8 }}>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <button type="button" className="btn btn--danger" onClick={() => setOpen(false)}>
          Suspend
        </button>
      </div>
    </div>
  );
  return (
    <>
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Open {kind}
      </button>
      {open &&
        (kind === 'modal' ? (
          <Modal label="Suspend tenant" onClose={() => setOpen(false)}>
            {body}
          </Modal>
        ) : (
          <Drawer label="Tenant details" onClose={() => setOpen(false)}>
            {body}
          </Drawer>
        ))}
    </>
  );
}

/** Escape closes, focus is trapped and restored, the page behind is inert. */
export const ModalDialog: Story = { render: () => <Demo kind="modal" /> };
export const SideDrawer: Story = { render: () => <Demo kind="drawer" /> };
