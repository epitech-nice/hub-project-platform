// Cartes cliquables pour choisir un gate ACE physique — remplace le <Select> natif utilisé
// jusqu'ici : affiche une vraie pastille de couleur (à partir du hex rapporté par l'agent) pour
// que l'étudiant repère visuellement la bonne bobine plutôt que par nom de matière seul. Voir
// spec 2026-09-10.
import { useState } from 'react';
import Button from './Button';
import Modal from './Modal';
import Input from './Input';
import { cn } from '../../lib/cn';
import { normalizeColor } from '../../utils/spoolMatch';

const GATE_LABELS = ['Slot 1', 'Slot 2', 'Slot 3', 'Slot 4'];

const swatchColor = (hex) => (hex ? `#${hex.replace('#', '').slice(0, 6)}` : 'transparent');

// Couleurs filament courantes, pour éviter d'obliger l'étudiant à régler une teinte précise au
// pixel près sur le <input type="color"> natif (peu pratique pour "juste dire c'est marron") —
// le picker natif reste disponible en-dessous pour une couleur non listée ici.
const PRESET_COLORS = [
  { name: 'Blanc', hex: 'ffffff' },
  { name: 'Noir', hex: '000000' },
  { name: 'Gris', hex: '808080' },
  { name: 'Rouge', hex: 'e53935' },
  { name: 'Orange', hex: 'ff6a14' },
  { name: 'Jaune', hex: 'fed141' },
  { name: 'Vert', hex: '43a047' },
  { name: 'Bleu', hex: '1e88e5' },
  { name: 'Violet', hex: '8e24aa' },
  { name: 'Rose', hex: 'ec407a' },
  { name: 'Marron', hex: '6d4c41' },
  { name: 'Or', hex: 'd4af37' },
  { name: 'Argent', hex: 'c0c0c0' },
  { name: 'Naturel', hex: 'e8d6b3' },
];

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
    } catch {
      // L'erreur a déjà été affichée (toast) par onManualDeclare, qui la relance délibérément
      // pour empêcher la fermeture de la modale — ce catch existe seulement pour éviter une
      // unhandled promise rejection, pas pour changer le comportement.
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
            <div className="grid grid-cols-7 gap-2">
              {PRESET_COLORS.map((preset) => {
                const isSelected = normalizeColor(editColor) === preset.hex;
                return (
                  <button
                    key={preset.hex}
                    type="button"
                    onClick={() => setEditColor(`#${preset.hex}`)}
                    title={preset.name}
                    aria-label={preset.name}
                    className={cn(
                      'h-8 w-8 rounded-full border',
                      isSelected ? 'border-primary ring-2 ring-primary/40' : 'border-border'
                    )}
                    style={{ backgroundColor: `#${preset.hex}` }}
                  />
                );
              })}
            </div>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-primary">Couleur personnalisée</summary>
              <input
                type="color"
                value={editColor}
                onChange={(e) => setEditColor(e.target.value)}
                className="mt-2 h-10 w-full rounded-md border border-border cursor-pointer"
              />
            </details>
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
