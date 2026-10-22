/**
 * Évolutions : `weapon` (arme de base niveau max) + `with` (passif niveau max) => `result`.
 * L'arme est remplacée par son évolution (même emplacement), le passif est conservé.
 * L'ordre de cette liste sert aussi de priorité quand plusieurs évolutions sont possibles.
 * (Dans le code, une évolution s'appelle encore « fusion ».)
 */

export interface FusionDef {
  result: string;
  weapon: string;
  /** passif requis */
  with: string;
}

export const FUSIONS: FusionDef[] = [
  { result: 'cotillons', weapon: 'confetti', with: 'cafe' },
  { result: 'trounoir', weapon: 'petitspois', with: 'aimant' },
  { result: 'malaise', weapon: 'aura', with: 'soupe' },
  { result: 'multiprise', weapon: 'rallonge', with: 'cafe' },
  { result: 'creperang', weapon: 'boomerang', with: 'lunettes' },
  { result: 'periph', weapon: 'klaxon', with: 'chaussettes' },
  { result: 'faux', weapon: 'fouet', with: 'biceps' },
  { result: 'tornade', weapon: 'flammes', with: 'lunettes' },
  { result: 'phenix', weapon: 'flammes', with: 'soupe' },
  { result: 'bastion', weapon: 'tourelle', with: 'blindage' },
  { result: 'escadrille', weapon: 'ricochet', with: 'blindage' },
  { result: 'kamikazes', weapon: 'drone', with: 'biceps' },
  { result: 'meteores', weapon: 'mortier', with: 'chance' },
];
