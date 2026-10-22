/**
 * Fusions : `weapon` (arme de base niveau max) + `with` (arme ou passif niveau max) => `result`.
 * - avec une arme : les deux armes disparaissent, l'arme fusionnée prend la place de `weapon` (un emplacement se libère).
 * - avec un passif : l'arme est remplacée, le passif est conservé.
 * L'ordre de cette liste sert aussi de priorité quand plusieurs fusions sont possibles.
 */

export interface FusionDef {
  result: string;
  weapon: string;
  with: string;
  withKind: 'weapon' | 'passive';
}

export const FUSIONS: FusionDef[] = [
  { result: 'cotillons', weapon: 'confetti', with: 'cafe', withKind: 'passive' },
  { result: 'trounoir', weapon: 'petitspois', with: 'aimant', withKind: 'passive' },
  { result: 'malaise', weapon: 'aura', with: 'soupe', withKind: 'passive' },
  { result: 'multiprise', weapon: 'rallonge', with: 'laser', withKind: 'weapon' },
  { result: 'creperang', weapon: 'boomerang', with: 'crepes', withKind: 'weapon' },
  { result: 'periph', weapon: 'klaxon', with: 'chaussettes', withKind: 'passive' },
  { result: 'faux', weapon: 'fouet', with: 'biceps', withKind: 'passive' },
  { result: 'tornade', weapon: 'flammes', with: 'lunettes', withKind: 'passive' },
  { result: 'phenix', weapon: 'flammes', with: 'soupe', withKind: 'passive' },
  { result: 'bastion', weapon: 'tourelle', with: 'blindage', withKind: 'passive' },
  { result: 'escadrille', weapon: 'ricochet', with: 'drone', withKind: 'weapon' },
  { result: 'kamikazes', weapon: 'drone', with: 'mortier', withKind: 'weapon' },
  { result: 'meteores', weapon: 'mortier', with: 'chance', withKind: 'passive' },
];
