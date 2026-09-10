// Cartes cliquables pour choisir un gate ACE physique — remplace le <Select> natif utilisé
// jusqu'ici : affiche une vraie pastille de couleur (à partir du hex rapporté par l'agent) pour
// que l'étudiant repère visuellement la bonne bobine plutôt que par nom de matière seul. Voir
// spec 2026-09-10.
import { useState } from 'react';
import Button from './Button';
import Modal from './Modal';
import Input from './Input';
import { cn } from '../../lib/cn';

const GATE_LABELS = ['Slot 1', 'Slot 2', 'Slot 3', 'Slot 4'];

const swatchColor = (hex) => (hex ? `#${hex.replace('#', '').slice(0, 6)}` : 'transparent');

export default function GatePicker({ slots, value, onChange, onManualDeclare }) {
  const [editingGate, setEditingGate] = useState(null);
  const [editMaterial, setEditMaterial] = useState('');
  const [editColor, setEditColor] = useState('#808080');
  const [saving, setSaving] = useState(false);

  const openEdit = (slot) => {
    setEditingGate(slot.gate);
    setEditMaterial(slot.material || '');
    setEditColor(slot.color ? swatchColor(slot.color) : '#808080');
  };

  const closeEdit = () => setEditingGate(null);

  const handleSave = async () => {
    if (!editMaterial.trim()) return;
    setSaving(true);
    try {
      await onManualDeclare(editingGate, { material: editMaterial.trim(), color: editColor });
      closeEdit();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {slots.map((slot) => (
          <div
            key={slot.gate}
            className={cn(
              'flex flex-col items-center gap-1.5 rounded-md border px-2 py-3',
              value === slot.gate ? 'border-primary ring-2 ring-primary/30' : 'border-border'
            )}
          >
            <button
              type="button"
              onClick={() => onChange(slot.gate)}
              disabled={slot.empty}
              className="flex flex-col items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <span
                className="h-6 w-6 rounded-full border border-border"
                style={{ backgroundColor: swatchColor(slot.color) }}
                aria-hidden="true"
              />
              <span className="text-xs font-medium text-text">
                {GATE_LABELS[slot.gate] || `Slot ${slot.gate + 1}`}
              </span>
              <span className="text-xs text-text-muted">
                {slot.empty ? 'Vide' : slot.material || 'Matière inconnue'}
              </span>
            </button>
            {slot.source === 'manual' && (
              <span className="text-[10px] text-text-dim">déclaré manuellement</span>
            )}
            <button type="button" onClick={() => openEdit(slot)} className="text-[10px] text-primary underline">
              Déclarer manuellement
            </button>
          </div>
        ))}
      </div>

      <Modal
        open={editingGate !== null}
        onClose={closeEdit}
        title={`Déclarer le contenu — ${GATE_LABELS[editingGate] || `Slot ${(editingGate ?? 0) + 1}`}`}
        size="sm"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="subtle" onClick={closeEdit} disabled={saving}>
              Annuler
            </Button>
            <Button onClick={handleSave} loading={saving} disabled={saving || !editMaterial.trim()}>
              Enregistrer
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <div>
            <label className="block mb-2 font-medium text-text">Matière</label>
            <Input value={editMaterial} onChange={(e) => setEditMaterial(e.target.value)} placeholder="PLA, PETG..." />
          </div>
          <div>
            <label className="block mb-2 font-medium text-text">Couleur</label>
            <input
              type="color"
              value={editColor}
              onChange={(e) => setEditColor(e.target.value)}
              className="h-10 w-full rounded-md border border-border cursor-pointer"
            />
          </div>
          <p className="text-xs text-text-muted">
            Utile pour une bobine générique sans puce RFID, que l&apos;imprimante ne peut pas détecter
            automatiquement. Cette déclaration sera automatiquement remplacée dès qu&apos;une détection
            automatique différente est rapportée.
          </p>
        </div>
      </Modal>
    </>
  );
}
