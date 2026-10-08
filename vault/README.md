# הכספת החתומה של מפקדת הצי — Fleet HQ Sealed Vault

**החוק:** מפתחות לעולם לא נוסעים בגיט בטקסט פתוח. הארטיפקט היחיד שמועלה לגיט הוא
`keys.env.enc` — מוצפן AES-256 עם PBKDF2 (200 אלף איטרציות). הסיסמה קיימת אך ורק
אצל הבעלים (ואופציונלית ב-`vault/.passphrase` — gitignored, להפעלות שקטות).

## מה נמצא כאן

| קובץ | בגיט? | תפקיד |
|---|---|---|
| `keys.env` | ❌ gitignored (600) | המקור הפתוח — כל המפתחות של המשרד והפיתוח |
| `keys.env.enc` | ✅ כן | הכספת החתומה — הגרסה המוצפנת שנוסעת לגיט |
| `vault.sh` | ✅ כן | seal / open / deploy / status |
| `.passphrase` | ❌ gitignored | סיסמת הכספת (להפעלה אוטונומית מקומית) |

## פעולות

```bash
# חתימה: עדכנת מפתחות? אטום מחדש והעלה לגיט
VAULT_PASSPHRASE=... bash vault/vault.sh seal
git add vault/keys.env.enc && git commit -m "vault: re-seal keys" && git push

# פתיחה במכונה חדשה: מפענח ומפרוס אוטומטית לשני הצרכנים
VAULT_PASSPHRASE=... bash vault/vault.sh open
#   → .env.local (קבלת עמית ב-Next.js) + mini-services/agent-hq/.env (המשרד)
```

## שחזור המשרד מאפס (כל מכונה)

```bash
git clone https://github.com/roshpinacare-sys/FleetHQ && cd FleetHQ
VAULT_PASSPHRASE=... bash vault/vault.sh open
cd mini-services/agent-hq && bun install && ./run-office.sh
```

פרטי הריצה המלאים: `mini-services/agent-hq/README.md` · דוקטרינת אבטחה: `SECURITY.md`.
