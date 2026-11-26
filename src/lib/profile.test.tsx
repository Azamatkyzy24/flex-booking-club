import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  cleanName, validateMemberName, validatePassword, validateTrainerProfile, validateAvatarFile, avatarPath, initialsOf,
  type TrainerProfileInput,
} from "./profile";
import { MemberAvatar } from "@/components/gym/MemberAvatar";

// Fake Supabase: we check what the app sends and how it reacts to the answer.
const rpc = vi.fn();
const updateUser = vi.fn();
const upload = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    auth: {
      updateUser: (...a: unknown[]) => updateUser(...a),
      getSession: async () => ({ data: { session: null } }), // after saving, the app reloads the data
      getUser: async () => ({ data: { user: { id: "user-1" } } }),
    },
    storage: {
      from: () => ({
        upload: (...a: unknown[]) => upload(...a),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://demo.supabase.co/storage/v1/object/public/avatars/${path}` } }),
      }),
    },
  },
}));
import { updateMemberProfile, changePassword, uploadAvatar, removeAvatar } from "./store";
import { updateTrainerProfile } from "./trainer";

beforeEach(() => { rpc.mockReset(); updateUser.mockReset(); upload.mockReset(); });

// ---------------------------------------------------------------
// User profile
// ---------------------------------------------------------------
describe("User profile: name", () => {
  it("PR01: accepts a normal name, also in Kazakh/Russian letters", () => {
    expect(validateMemberName("Aidana Azamatkyzy")).toBeNull();
    expect(validateMemberName("Әйгерім Қуат")).toBeNull();
    expect(validateMemberName("Mary-Jane O'Neil")).toBeNull();
  });

  it("PR02: rejects an empty name or only spaces", () => {
    expect(validateMemberName("")).toBe("Name must be 2-60 characters.");
    expect(validateMemberName("     ")).toBe("Name must be 2-60 characters.");
  });

  it("PR03: name length boundaries: 1 and 61 rejected, 2 and 60 accepted", () => {
    expect(validateMemberName("A")).not.toBeNull();
    expect(validateMemberName("Al")).toBeNull();
    expect(validateMemberName("A".repeat(60))).toBeNull();
    expect(validateMemberName("A".repeat(61))).not.toBeNull();
  });

  it("PR04: rejects digits, symbols and HTML in the name", () => {
    expect(validateMemberName("Aidana123")).not.toBeNull();
    expect(validateMemberName("<script>alert(1)</script>")).not.toBeNull();
    expect(validateMemberName("Aidana@")).not.toBeNull();
  });

  it("PR05: extra spaces are removed before saving", () => {
    expect(cleanName("  Aidana    Azamatkyzy ")).toBe("Aidana Azamatkyzy");
  });

  it("PR06: saving sends the cleaned name to the database", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await updateMemberProfile("  Aidana   A ");
    expect(rpc).toHaveBeenCalledWith("update_member_profile", { p_full_name: "Aidana A" });
  });

  it("PR07: if the database refuses, the user sees its message", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Please log in." } });
    await expect(updateMemberProfile("Aidana")).rejects.toThrow("Please log in.");
  });
});

describe("User profile: password", () => {
  it("PR08: accepts a strong password typed twice the same", () => {
    expect(validatePassword("gymflow2026", "gymflow2026")).toBeNull();
  });

  it("PR09: rejects short passwords (7 characters) and accepts 8", () => {
    expect(validatePassword("abc1234", "abc1234")).toBe("Password must be at least 8 characters.");
    expect(validatePassword("abcd1234", "abcd1234")).toBeNull();
  });

  it("PR10: rejects passwords without a digit or without a letter", () => {
    expect(validatePassword("onlyletters", "onlyletters")).toBe("Password must contain a letter and a digit.");
    expect(validatePassword("12345678", "12345678")).toBe("Password must contain a letter and a digit.");
  });

  it("PR11: rejects when the two passwords do not match", () => {
    expect(validatePassword("gymflow2026", "gymflow2025")).toBe("Passwords do not match.");
  });

  it("PR12: changing the password calls Supabase Auth and shows its error", async () => {
    updateUser.mockResolvedValueOnce({ error: null });
    await changePassword("gymflow2026");
    expect(updateUser).toHaveBeenCalledWith({ password: "gymflow2026" });
    updateUser.mockResolvedValueOnce({ error: { message: "New password should be different from the old password." } });
    await expect(changePassword("gymflow2026")).rejects.toThrow("different from the old password");
  });
});

// ---------------------------------------------------------------
// Trainer profile
// ---------------------------------------------------------------
const trainer = (over: Partial<TrainerProfileInput> = {}): TrainerProfileInput => ({
  title: "Yoga coach", biography: "10 years of yoga.", philosophy: "Slow is smooth.",
  expertise: ["Yoga", "Mobility"], certifications: ["RYT-200"], photoUrl: "/trainers/maya-torres.png", ...over,
});

describe("Trainer profile", () => {
  it("PR13: a normal trainer profile is accepted (photo link optional)", () => {
    expect(validateTrainerProfile(trainer())).toBeNull();
    expect(validateTrainerProfile(trainer({ photoUrl: "" }))).toBeNull();
  });

  it("PR14: text limits: title 80, biography 1000, philosophy 300", () => {
    expect(validateTrainerProfile(trainer({ title: "T".repeat(80) }))).toBeNull();
    expect(validateTrainerProfile(trainer({ title: "T".repeat(81) }))).toBe("Title must be 80 characters or fewer.");
    expect(validateTrainerProfile(trainer({ biography: "B".repeat(1001) }))).toBe("Biography must be 1000 characters or fewer.");
    expect(validateTrainerProfile(trainer({ philosophy: "P".repeat(301) }))).toBe("Philosophy must be 300 characters or fewer.");
  });

  it("PR15: at most 8 areas of expertise and 8 certifications", () => {
    const nine = Array.from({ length: 9 }, (_, i) => `Item ${i}`);
    expect(validateTrainerProfile(trainer({ expertise: nine.slice(0, 8) }))).toBeNull();
    expect(validateTrainerProfile(trainer({ expertise: nine }))).toBe("Add at most 8 areas of expertise.");
    expect(validateTrainerProfile(trainer({ certifications: nine }))).toBe("Add at most 8 certifications.");
  });

  it("PR16: photo link must be https:// or a site path (no http://, no javascript:)", () => {
    expect(validateTrainerProfile(trainer({ photoUrl: "https://example.com/a.png" }))).toBeNull();
    expect(validateTrainerProfile(trainer({ photoUrl: "http://example.com/a.png" }))).not.toBeNull();
    expect(validateTrainerProfile(trainer({ photoUrl: "javascript:alert(1)" }))).not.toBeNull();
  });

  it("PR17: saving sends every field to the database", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await updateTrainerProfile(trainer());
    expect(rpc).toHaveBeenCalledWith("trainer_update_profile", {
      p_professional_title: "Yoga coach", p_biography: "10 years of yoga.", p_philosophy: "Slow is smooth.",
      p_expertise: ["Yoga", "Mobility"], p_certifications: ["RYT-200"], p_photo_url: "/trainers/maya-torres.png",
    });
  });

  it("PR18: a member who is not a trainer cannot save a trainer profile", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "Trainers only." } });
    await expect(updateTrainerProfile(trainer())).rejects.toThrow("Trainers only.");
  });
});

// ---------------------------------------------------------------
// User profile photo
// ---------------------------------------------------------------
const MB = 1024 * 1024;

describe("User profile: photo", () => {
  it("PR19: accepts JPG, PNG and WEBP pictures", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) expect(validateAvatarFile({ type, size: MB })).toBeNull();
  });

  it("PR20: rejects other files (GIF, PDF, SVG)", () => {
    for (const type of ["image/gif", "application/pdf", "image/svg+xml"])
      expect(validateAvatarFile({ type, size: MB })).toBe("Choose a JPG, PNG or WEBP picture.");
  });

  it("PR21: size limit: exactly 2 MB is fine, 2 MB + 1 byte and empty files are rejected", () => {
    expect(validateAvatarFile({ type: "image/png", size: 2 * MB })).toBeNull();
    expect(validateAvatarFile({ type: "image/png", size: 2 * MB + 1 })).toBe("The picture must be 2 MB or smaller.");
    expect(validateAvatarFile({ type: "image/png", size: 0 })).toBe("This file is empty.");
  });

  it("PR22: the photo is stored in the user's own folder with the right extension", () => {
    expect(avatarPath("user-1", "image/png")).toBe("user-1/avatar.png");
    expect(avatarPath("user-1", "image/jpeg")).toBe("user-1/avatar.jpg");
    expect(avatarPath("user-1", "image/webp")).toBe("user-1/avatar.webp");
  });

  it("PR23: upload saves the picture, then saves its public link to the profile", async () => {
    upload.mockResolvedValue({ data: {}, error: null });
    rpc.mockResolvedValue({ data: null, error: null });
    const file = new File(["x"], "me.png", { type: "image/png" });
    await uploadAvatar(file);
    expect(upload).toHaveBeenCalledWith("user-1/avatar.png", file, { upsert: true, contentType: "image/png" });
    const [fn, args] = rpc.mock.calls[0]!;
    expect(fn).toBe("update_member_avatar");
    expect((args as { p_avatar_url: string }).p_avatar_url).toMatch(/^https:\/\/demo\.supabase\.co\/storage\/v1\/object\/public\/avatars\/user-1\/avatar\.png\?v=\d+$/);
  });

  it("PR24: if the upload fails, the profile link is not changed", async () => {
    upload.mockResolvedValue({ data: null, error: { message: "The object exceeded the maximum allowed size" } });
    await expect(uploadAvatar(new File(["x"], "me.png", { type: "image/png" }))).rejects.toThrow("maximum allowed size");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("PR25: removing the photo saves an empty link", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await removeAvatar();
    expect(rpc).toHaveBeenCalledWith("update_member_avatar", { p_avatar_url: null });
  });

  it("PR26: shows the photo; shows initials when there is no photo or it fails to load", () => {
    expect(initialsOf("aidana   azamatkyzy")).toBe("AA");
    const { unmount } = render(<MemberAvatar name="Aidana Azamatkyzy" url={null} />);
    expect(screen.getByText("AA")).toBeInTheDocument();
    unmount();
    render(<MemberAvatar name="Aidana Azamatkyzy" url="https://demo.supabase.co/a.png" />);
    const img = screen.getByAltText("Aidana Azamatkyzy profile photo");
    fireEvent.error(img); // broken link
    expect(screen.getByText("AA")).toBeInTheDocument();
  });
});
