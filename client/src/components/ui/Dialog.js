import Modal from './Modal';

export default function Dialog({ open, onClose, title, children, footer, className = '' }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={footer}
      size="sm"
      className={className}
    >
      {children}
    </Modal>
  );
}
