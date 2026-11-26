import { z } from "zod";
import { LIMITS } from "@/lib/constants";
import { zv } from "@/lib/validation";

export const loginSchema = z.object({
  username: zv.text("Ingresá el usuario"),
  password: z.string().min(1, "Ingresá la contraseña"),
  confirm: z.string(),
});

const newPassword = z
  .string()
  .min(LIMITS.MIN_PASSWORD_LENGTH, `Mínimo ${LIMITS.MIN_PASSWORD_LENGTH} caracteres`);

const passwordsMatch = { path: ["confirm"], message: "Las contraseñas no coinciden" };

/** Primer inicio: se crea el usuario. Mismo shape que el login para compartir formulario. */
export const setupSchema = loginSchema
  .extend({ password: newPassword })
  .refine((v) => v.password === v.confirm, passwordsMatch);

export type CredentialsValues = z.infer<typeof loginSchema>;

export const emptyCredentials: CredentialsValues = { username: "", password: "", confirm: "" };

export const changePasswordSchema = z
  .object({
    current: z.string().min(1, "Ingresá la contraseña actual"),
    password: newPassword,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, passwordsMatch);

export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;

export const emptyChangePassword: ChangePasswordValues = { current: "", password: "", confirm: "" };
