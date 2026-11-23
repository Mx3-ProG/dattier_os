# IA open source pour Dattier (LLM + STT + TTS)

Objectif : proposer des alternatives à Anthropic pour activer l’assistant STUDIO VOICE
et les fonctionnalités IA (extraction de factures, réception vocale, commandes vocales
dans l’app) sur un hébergement hybride (local + cloud). Aucun changement de code
n’est fait ici : c’est une feuille de route de raccordement.

## 1. État actuel

- `src/features/assistant/llm.ts` : `llmEnabled()` = `!!process.env.ANTHROPIC_API_KEY`.
- Modèle par défaut `claude-opus-5-5` (variable `ATACUISINE_AI_MODEL`).
- STT/TTS côté navigateur via Web Speech API (`src/components/assistant/cuisine-ia.tsx`).
- Extraction factures : `src/features/invoices/extract.ts` utilise `setInvoiceAi(...)` ;
  sans clé, aucune extraction IA.
- Le moteur réflexe (`reflex.ts`) fonctionne sans fournisseur et couvre la majorité
  des actions courantes.

Pour « activer toutes les fonctionnalités importantes » aujourd’hui, il suffit de
mettre une clé Anthropic dans `.env.local` / Vercel. Pour une stratégie open source,
il faut abstraire le provider.

## 2. Recommandations par brique

### LLM (génération + appels d’outils)

Le code utilise des **outils structurés** (`propose_*`, `ask_user`, `read_finance`).
Il faut donc un modèle avec un **function calling fiable en français**.

| Option | Type | Forces | Faiblesses | Verdict |
|---|---|---|---|---|
| Mistral Large / Mistral Small (cloud, api.mistral.ai) | Cloud EU | Français natif, function calling stable, hébergement EU (RGPD), prix bas | Payant (mais moins qu’Anthropic) | **Recommandé principal** |
| Llama 3.3 70B (via Groq ou Together) | Cloud | Très rapide (Groq), open weights | Function calling parfois fragile en français | Bon pour le coût |
| Qwen 2.5 72B (via Together / Ollama) | Cloud ou local | Excellent function calling, multilingue | Infra à gérer si local | Alternative solide |
| DeepSeek V3 (via API DeepSeek) | Cloud | Très bon rapport qualité/prix, function calling | Hébergement hors EU, latence | À éviter pour données clients |
| Ollama local (Llama 3.3 70B / Qwen 2.5) | Local | Gratuit, données sur place | GPU requis (≥ 48 Go VRAM pour 70B), latence | Pour l’auto-hébergement |

**Recommandation hybride** : Mistral (cloud, EU) comme provider principal pour la
qualité et le RGPD, avec repli sur Ollama local (Llama 3.3 70B ou Qwen 2.5 32B)
pour les déploiements auto-hébergés / hors ligne. Ne pas utiliser de modèle < 30B
pour les outils : le function calling devient peu fiable.

### STT (speech-to-text)

Le composant utilise déjà `SpeechRecognition` du navigateur. Pour une réception
téléphonique / serveur, il faut un STT serveur.

| Option | Type | Forces | Verdict |
|---|---|---|---|
| Whisper large-v3 (faster-whisper, local) | Local | Meilleure qualité FR, gratuit, offline | GPU recommandé, latence ~1-3 s |
| Groq Whisper (whisper-large-v3) | Cloud | Très rapide, prix très bas, API OpenAI-compatible | Données transitent par Groq |
| Deepgram Nova-2 (fr) | Cloud | Streaming temps réel, ponctuation | Payant, hors EU |
| AssemblyAI | Cloud | Bonne qualité FR | Payant |
| Vosk (modèle fr) | Local | Léger, CPU, offline | Qualité inférieure à Whisper |

**Recommandation hybride** : faster-whisper (large-v3) en local pour l’auto-hébergement
et la confidentialité ; Groq Whisper en cloud pour la vitesse et le coût. Exposer un
endpoint `POST /api/.../transcribe` qui accepte un blob audio et renvoie le texte,
puis le faire passer par `ask()` comme un message texte.

### TTS (text-to-speech)

Le composant utilise `speechSynthesis` du navigateur. Pour la réception téléphonique
ou un accueil vocal, il faut un TTS serveur.

| Option | Type | Forces | Verdict |
|---|---|---|---|
| Piper (voix fr) | Local | Gratuit, offline, très rapide, voix correctes | Qualité « robotique » acceptable |
| Coqui XTTS v2 | Local | Clonage de voix, qualité élevée | GPU, plus lent |
| ElevenLabs | Cloud | Meilleure qualité, voix naturelles | Payant, hors EU, RGPD à vérifier |
| OpenAI TTS (tts-1) | Cloud | Simple, API OpenAI-compatible | Payant, voix FR moyennes |
| Mistral TTS (si disponible) | Cloud EU | Cohérent avec le LLM | À surveiller |

**Recommandation hybride** : Piper en local pour l’auto-hébergement et le coût nul ;
ElevenLabs ou OpenAI TTS en cloud pour la qualité premium (option payante).

## 3. Architecture hybride proposée

```
┌──────────────────────────────────────────────────────┐
│  Navigateur (cuisine-ia.tsx)                         │
│  - Web Speech API (STT/TTS navigateur) [existant]   │
│  - Nouveau : upload audio → /api/.../transcribe      │
│  - Nouveau : play audio ← /api/.../speak             │
└────────────┬─────────────────────────────────────────┘
             │
┌────────────▼─────────────────────────────────────────┐
│  Next.js (src/features/assistant/*)                   │
│  - ask() / askLlm()  ──►  LlmProvider interface      │
│       ├── AnthropicProvider (existant)               │
│       ├── OpenAiCompatibleProvider (Mistral/Groq/    │
│       │   Ollama/vLLM, via base URL configurable)    │
│  - transcribe() ──► SttProvider                      │
│       ├── WhisperLocal (faster-whisper)              │
│       └── GroqWhisper                                │
│  - speak() ──► TtsProvider                           │
│       ├── PiperLocal                                 │
│       └── ElevenLabs / OpenAI                        │
└──────────────────────────────────────────────────────┘
```

### Variables d’environnement à ajouter (proposition)

```sh
# LLM
AI_PROVIDER=openai-compatible        # anthropic | openai-compatible
AI_BASE_URL=https://api.mistral.ai/v1
AI_API_KEY=...
AI_MODEL=mistral-large-latest
# ou local :
# AI_BASE_URL=http://localhost:11434/v1
# AI_MODEL=llama3.3:70b

# STT
STT_PROVIDER=whisper-local           # whisper-local | groq-whisper | deepgram
STT_BASE_URL=http://localhost:8000  # si local
STT_API_KEY=...                     # si cloud

# TTS
TTS_PROVIDER=piper                   # piper | elevenlabs | openai
TTS_BASE_URL=http://localhost:5000
TTS_API_KEY=...
TTS_VOICE=fr_FR-siwis-medium
```

### Abstraction minimale côté code (à implémenter plus tard)

1. Créer `src/features/assistant/providers.ts` avec une interface :
   ```ts
   export interface LlmProvider {
     chat(messages, tools, system): Promise<{ text, toolCalls, usage }>;
   }
   ```
2. Refactorer `llm.ts` pour utiliser `LlmProvider` au lieu de `Anthropic` directement.
   Conserver l’API Anthropic comme `AnthropicProvider`.
   Ajouter `OpenAiCompatibleProvider` (Mistral, Groq, Ollama, vLLM, Together)
   via le SDK `openai` (compatible) ou un fetch maison.
3. Adapter le format des outils : Anthropic utilise `input_schema`, OpenAI utilise
   `parameters` (JSON Schema). Écrire un convertisseur unique.
4. STT/TTS : nouveaux modules `src/features/voice/stt.ts` et `tts.ts` + routes
   `src/app/api/restaurants/[restaurant]/voice/transcribe/route.ts` et `.../speak/route.ts`.
5. Réception vocale (téléphone) : nécessite un fournisseur télécom (Twilio, OVH)
   pour recevoir l’appel, streamer l’audio vers le STT, puis répondre via TTS.
   C’est un chantier séparé, à valider avec un contrat télécom.

## 4. Plan d’implémentation recommandé (par étapes)

1. **Court terme (sans code)** : mettre `ANTHROPIC_API_KEY` pour activer l’IA
   avancée et toutes les fonctionnalités dépendantes (extraction factures, analyse).
   Le moteur réflexe couvre déjà l’essentiel.
2. **Étape 1 (abstraction LLM)** : introduire `LlmProvider` + `OpenAiCompatibleProvider`,
   garder Anthropic. Tester avec Mistral cloud.
3. **Étape 2 (STT serveur)** : endpoint de transcription Whisper (local ou Groq),
   branché sur `ask()` comme un message texte.
4. **Étape 3 (TTS serveur)** : endpoint de synthèse Piper/ElevenLabs, lecture audio
   dans `cuisine-ia.tsx`.
5. **Étape 4 (réception téléphonique)** : intégration Twilio/OVH + streaming audio,
   après validation contractuelle et RGPD.

## 5. Points d’attention

- **RGPD** : les données clients (réservations, commandes) ne doivent pas transiter
  par un cloud hors EU sans DPA. Mistral (EU) et l’auto-hébergement sont préférables.
- **Coût** : le moteur réflexe reste gratuit côté fournisseur ; l’IA avancée est
  facturée en crédits. Un provider open source local réduit le coût à ~0 mais
  nécessite du matériel.
- **Qualité du function calling** : tester chaque modèle sur le jeu de tests
  `tests/assistant.test.ts` avant de le proposer aux utilisateurs.
- **Latence** : viser < 3 s pour une réponse vocale acceptable.
- **Fallback** : toujours garder le moteur réflexe comme filet de sécurité si le
  provider IA est indisponible.

## 6. Décision à prendre

Choisir :
- le provider LLM principal (Mistral cloud recommandé pour EU/RGPD) ;
- le mode STT (Whisper local vs Groq cloud) ;
- le mode TTS (Piper local vs ElevenLabs cloud) ;
- si la réception téléphonique est dans le périmètre (nécessite un contrat télécom).

Une fois ces choix faits, l’implémentation peut suivre le plan de l’étape 1 à 4.
