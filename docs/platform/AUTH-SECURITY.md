# Sécurité des comptes (inscription, mots de passe, e-mails)

## Ce que fait le code

| Contrôle | Où | Détail |
| --- | --- | --- |
| Mot de passe robuste | `src/infrastructure/auth/password-policy.ts` (navigateur + serveur) | 12 à 72 caractères, minuscule, majuscule, chiffre, caractère spécial, pas d’espace, pas de mot courant, pas l’adresse e-mail, pas 4 caractères identiques à la suite. |
| Mot de passe déjà compromis | `src/infrastructure/auth/breached-password.ts` (serveur) | Have I Been Pwned (k-anonymat : seuls 5 caractères du SHA-1 sortent) + listes SecLists (200 000 mots de passe les plus utilisés, cache 24 h). |
| Confirmation du mot de passe, œil afficher/masquer | `src/components/auth/password-field.tsx` | Liste des règles en direct, accessible au lecteur d’écran. |
| Trousseau de l’appareil | `password-field.tsx` | `autocomplete="new-password"` + `passwordrules` (Safari / iCloud) : l’appareil propose un mot de passe fort conforme et l’enregistre. Rien n’est stocké chez nous. |
| E-mails jetables | `src/infrastructure/auth/disposable-email.ts` | Liste intégrée + liste communautaire disposable-email-domains (~5 000 domaines, cache 24 h) + mots-clés + DNS (le domaine doit recevoir des e-mails ; ses serveurs MX ne doivent pas appartenir à un service jetable). Les domaines pro passent. Faux positif : `DISPOSABLE_EMAIL_ALLOWLIST=domaine1.fr,domaine2.com`. |
| Inscription | `POST /auth/signup` | Toutes les règles ci-dessus revérifiées côté serveur avant d’appeler Supabase. 5 essais / minute / IP. |
| Nouveau mot de passe (lien de récupération) | `POST /auth/password` | Mêmes règles. |
| Connexion | `POST /auth/session` | Refuse un e-mail non confirmé et un e-mail jetable (comptes créés en contournant `/auth/signup`). |

## Stockage des mots de passe

Aucun mot de passe n’est écrit dans notre base. Ils transitent par `/auth/signup` et
`/auth/password` (jamais journalisés) puis Supabase Auth les stocke **hachés avec bcrypt**
(`auth.users.encrypted_password`), salés, non réversibles. Un chiffrement en plus n’apporte rien :
un hachage lent salé est la bonne pratique (OWASP). La colonne `customers.password_hash`
(migration 004) est un reliquat inutilisé : aucun code ne l’écrit.

## Réglages Supabase à faire dans le tableau de bord (obligatoire)

Le navigateur connaît la clé publique Supabase : quelqu’un pourrait appeler l’API Supabase
directement. Ces réglages ferment cette porte :

1. **Authentication → Sign In / Providers → Email**
   - « Confirm email » : **activé** (sans lui, pas de vérification d’adresse).
   - « Minimum password length » : **12**.
   - « Password requirements » : **Lowercase, uppercase letters, digits and symbols**.
   - « Prevent use of leaked passwords » : **activé** (offre Pro).
2. **Authentication → Emails → Confirm signup** : sujet « Confirmez votre adresse e-mail »,
   corps = contenu de `infra/supabase/templates/confirm-signup.html` (bouton « Confirmer mon adresse »).
3. **Authentication → URL Configuration → Redirect URLs** : `https://www.studio-os.digital/connexion/confirmation**`.
4. **Authentication → Emails → SMTP** : un SMTP personnalisé (Resend, Brevo…) ; le SMTP par défaut
   de Supabase est limité à quelques e-mails par heure.

## Variables optionnelles

- `DISPOSABLE_EMAIL_ALLOWLIST` : domaines à toujours accepter.
- `DISPOSABLE_EMAIL_REMOTE_LIST=false` : n’utiliser que la liste intégrée.
- `SECLISTS_PASSWORD_CHECK=false` : ne pas télécharger les listes SecLists (HIBP reste actif).
