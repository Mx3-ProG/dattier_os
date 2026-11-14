"use client";
import { useId, useState } from "react";
import { Check, Eye, EyeOff, X } from "lucide-react";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordProblem, passwordRules } from "@/infrastructure/auth/password-policy";

/**
 * Apple's password-rules syntax: Safari / iCloud Keychain generate a strong
 * password that already satisfies our policy. Other managers (Chrome, Google
 * Password Manager, 1Password, Bitwarden…) rely on autocomplete="new-password".
 */
const KEYCHAIN_RULES = `minlength: ${PASSWORD_MIN_LENGTH}; maxlength: ${PASSWORD_MAX_LENGTH}; required: lower; required: upper; required: digit; required: [-!?@#$%^&*_+=.,:;~]; allowed: ascii-printable;`;

/** Password input with a show/hide eye button. */
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  describedBy,
  invalid,
  name = "password",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "new-password" | "current-password";
  describedBy?: string;
  invalid?: boolean;
  name?: string;
}) {
  const [visible, setVisible] = useState(false);
  const id = useId();
  return (
    <div className="access-field">
      <label htmlFor={id}>{label}</label>
      <div className="access-password">
        <input
          id={id}
          name={name}
          type={visible ? "text" : "password"}
          {...(autoComplete === "new-password" ? { passwordrules: KEYCHAIN_RULES } : {})}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
          maxLength={PASSWORD_MAX_LENGTH}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
        />
        <button
          type="button"
          className="access-eye"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
          aria-pressed={visible}
          aria-controls={id}
        >
          {visible ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
        </button>
      </div>
    </div>
  );
}

/**
 * New password + confirmation, with the live rule checklist. Used on sign-up
 * and when choosing a new password after a recovery link.
 */
export function NewPasswordFields({
  password,
  confirm,
  onPassword,
  onConfirm,
  email = "",
}: {
  password: string;
  confirm: string;
  onPassword: (value: string) => void;
  onConfirm: (value: string) => void;
  email?: string;
}) {
  const rulesId = useId();
  const matchId = useId();
  const rules = passwordRules(password, email);
  const mismatch = confirm.length > 0 && confirm !== password;
  return (
    <>
      <PasswordField label="Mot de passe" value={password} onChange={onPassword} autoComplete="new-password" describedBy={rulesId} />
      <p className="access-hint access-keychain">
        Astuce : laissez votre appareil proposer un mot de passe fort. Il sera enregistré dans son trousseau
        (iCloud, Google, gestionnaire de mots de passe) et rempli automatiquement à la prochaine connexion.
      </p>
      <ul id={rulesId} className="access-rules" aria-label="Règles du mot de passe">
        {rules.map((rule) => (
          <li key={rule.id} className={rule.ok ? "ok" : undefined}>
            {rule.ok ? <Check size={15} aria-hidden /> : <X size={15} aria-hidden />}
            <span>{rule.label}</span>
            <span className="sr-only">{rule.ok ? " : respecté" : " : manquant"}</span>
          </li>
        ))}
      </ul>
      <PasswordField
        label="Confirmer le mot de passe"
        name="password-confirm"
        value={confirm}
        onChange={onConfirm}
        autoComplete="new-password"
        describedBy={matchId}
        invalid={mismatch}
      />
      <p id={matchId} className={mismatch ? "access-hint access-error" : "access-hint"} aria-live="polite">
        {mismatch ? "Les deux mots de passe ne correspondent pas." : confirm && confirm === password ? "Les mots de passe correspondent." : ""}
      </p>
    </>
  );
}

/** Client-side check run before submitting a new password. */
export function newPasswordError(password: string, confirm: string, email = "") {
  return passwordProblem(password, email) || (password !== confirm ? "Les deux mots de passe ne correspondent pas." : null);
}
