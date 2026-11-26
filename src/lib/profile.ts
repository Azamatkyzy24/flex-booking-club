// Checks for the profile forms. They return an error message, or null when the input is fine.
// The database checks the same rules again (migrations 0012 and 0020), these only give a quick message.

/** Trims and turns double spaces into one: "  Aidana   A " -> "Aidana A". */
export const cleanName = (name: string) => name.trim().replace(/\s+/g, " ");

/** Member name: 2-60 letters (any language), spaces, hyphens, apostrophes, dots. */
export function validateMemberName(name: string): string | null {
  const n = cleanName(name);
  if (n.length < 2 || n.length > 60) return "Name must be 2-60 characters.";
  if (!/^\p{L}[\p{L} '.-]*$/u.test(n)) return "Name can contain only letters, spaces, hyphens and apostrophes.";
  return null;
}

export const PASSWORD_MIN = 8;

/** New password: at least 8 characters, one letter and one digit, typed the same twice. */
export function validatePassword(password: string, confirm: string): string | null {
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters.`;
  if (!/\p{L}/u.test(password) || !/\d/.test(password)) return "Password must contain a letter and a digit.";
  if (password !== confirm) return "Passwords do not match.";
  return null;
}

export interface TrainerProfileInput {
  title: string; biography: string; philosophy: string;
  expertise: string[]; certifications: string[]; photoUrl: string;
}

/** Trainer profile: same limits as trainer_update_profile in the database. */
export function validateTrainerProfile(p: TrainerProfileInput): string | null {
  if (p.title.trim().length > 80) return "Title must be 80 characters or fewer.";
  if (p.biography.trim().length > 1000) return "Biography must be 1000 characters or fewer.";
  if (p.philosophy.trim().length > 300) return "Philosophy must be 300 characters or fewer.";
  if (p.expertise.length > 8) return "Add at most 8 areas of expertise.";
  if (p.certifications.length > 8) return "Add at most 8 certifications.";
  const photo = p.photoUrl.trim();
  if (photo && !/^(https:\/\/|\/)/.test(photo)) return "Photo link must start with https:// or /.";
  return null;
}
