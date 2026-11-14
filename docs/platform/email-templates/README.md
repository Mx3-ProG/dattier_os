# E-mails de compte (Supabase) et e-mails clients (Resend)

Deux circuits d'envoi :

| Circuit | Qui envoie | Gabarit |
| --- | --- | --- |
| Inscription, lien de connexion, mot de passe oublié, changement d'e-mail | Supabase Auth, via le SMTP Resend | Fichiers HTML de ce dossier, à coller dans Supabase |
| Messages clients, campagnes CRM, propositions | L'application, via l'API Resend | `src/features/messaging/email-layout.ts` (appliqué automatiquement) |

## 1. Resend : domaine d'envoi

1. Resend → Domains → ajouter un sous-domaine d'envoi, par exemple `mail.studio-os.digital`.
2. Créer chez le registrar les enregistrements DNS fournis par Resend (SPF/MX `send`, DKIM `resend._domainkey`) et attendre le statut **Verified**.
3. Ajouter un enregistrement DMARC sur le domaine :
   `_dmarc.studio-os.digital  TXT  "v=DMARC1; p=none; rua=mailto:dmarc@studio-os.digital"`
   (passer à `p=quarantine` une fois les rapports propres).
4. Resend → API Keys → créer une clé « Sending access » restreinte à ce domaine.
5. Vercel (Production) : `RESEND_API_KEY` = cette clé, `EMAIL_FROM` = `contact@mail.studio-os.digital`.

## 2. Supabase : SMTP personnalisé (obligatoire)

Sans SMTP personnalisé, Supabase n'envoie qu'aux membres de l'équipe du projet, avec un plafond de quelques e-mails par heure : les clients ne reçoivent rien.

Authentication → **Emails** → SMTP Settings → Enable custom SMTP :

| Champ | Valeur |
| --- | --- |
| Sender email | `connexion@mail.studio-os.digital` |
| Sender name | `STUDIO S` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | une clé API Resend (peut être la même que ci-dessus) |
| Minimum interval | `60` secondes (l'écran de connexion affiche le même délai) |

Authentication → **Rate Limits** : relever « Emails sent per hour » (30 par défaut une fois le SMTP branché) à 100 ou plus selon le trafic.

## 3. Supabase : URL et durée des liens

- Authentication → URL Configuration → Redirect URLs : ajouter
  `https://www.studio-os.digital/connexion/confirmation**`
  (les `**` sont indispensables : le lien porte `?returnTo=…`). Sans cette entrée, Supabase remplace l'adresse par la Site URL et les liens des gabarits ne fonctionnent plus.
- Authentication → Sign In / Providers → Email : « Email OTP Expiration » = `3600` secondes (les gabarits annoncent une heure).

## 4. Supabase : gabarits

Authentication → **Emails** → Templates. Pour chaque modèle, remplacer l'objet et coller le contenu du fichier HTML (onglet Source).

| Modèle Supabase | Objet | Fichier |
| --- | --- | --- |
| Confirm signup | `Confirmez votre adresse e-mail – STUDIO S` | `confirm-signup.html` |
| Magic Link | `Votre lien de connexion STUDIO S` | `magic-link.html` |
| Reset Password | `Choisissez un nouveau mot de passe – STUDIO S` | `reset-password.html` |
| Change Email Address | `Confirmez votre nouvelle adresse – STUDIO S` | `change-email.html` |

Les liens utilisent `{{ .TokenHash }}` et non `{{ .ConfirmationURL }}`. La page `/connexion/confirmation` valide le jeton côté navigateur. Les scanners de liens des messageries professionnelles (Outlook Safe Links, Mimecast, etc.) ouvrent les liens avant le destinataire. Avec `ConfirmationURL`, ils consomment le jeton et le client voit « lien expiré ». Le lien marche aussi si on l'ouvre sur un autre appareil que celui de la demande.

## 5. Vérification

1. `/connexion` → « Recevoir un lien de connexion par e-mail » → e-mail reçu en moins d'une minute, en français, aux couleurs de STUDIO S → clic → espace ouvert.
2. Même test depuis Gmail et Outlook, puis vérifier que l'e-mail n'arrive pas dans les indésirables.
3. Inscription, mot de passe oublié et changement d'adresse : même contrôle.
4. Resend → Emails : statut `delivered`, sans `bounced`.
