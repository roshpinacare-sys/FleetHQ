# הכספת החתומה של מפקדת הצי — Fleet HQ Sealed Vault (v2, 2026-10-09)

**החוק החדש — הכספת בעלת-עצמה:** סיסמת-האם P היא **אקראית** (לא טוקן של אף-אחד) ונוסעת
רק כ-WRAPS: `wraps/<sha256(C)>.enc = openssl(P, sha256hex(C))` — כל-טוקן-רשום פותח.
הרישום מתרחב-מעצמו: כל-אתחול מצליח רושם-את-הטוקן-שלו. ומעל-הכל — **מפתחות-פריסה SSH
שלא-תפוגים-לעולם** (מאוטמים ב-`ssh-keys.tar.enc`).

## פקודה-אחת (מכונה-חדשה, אפס-מפעיל)
```bash
bash vault/boot-sovereign.sh
```
מגלה-טוקן (env / upload/pat.env / git-credentials / netrc / gh / credential-helper /
deploy key) → מושך-את-הכספת-הפרטית → פותח-פקד → מפרוס-מפתחות → מתקין-deploy-keys →
רושם-wrap → כותב `sovereign-agent.env` → מעיר-שירותים. יוצא 0 = משרד-חי (ממופתח או
keyless-בכנות). יוצא 1 = אין-אף-טוקן-שמגיע-לכספת (הדבר-האחד-שמכונה-חדשה-חייבת).

## תיק-הכלים

| קובץ | בגיט? | תפקיד |
|---|---|---|
| `boot-sovereign.sh` | ✅ | האתחול-הריבוני (למעלה) |
| `vaultlib.sh` | ✅ | גילוי-טוקנים + פתיחת-wraps + רישום (הספרייה-המשותפת) |
| `vault.sh` | ✅ | seal / open / deploy / status (מאשר-כניסה-דרך-wraps) |
| `wrap.sh` | ✅ | `rekey` (סיבוב-סיסמה-מאסטר + בניית-כל-ה-wraps) / `open` / `status` |
| `auto-unseal.sh` | ✅ | מופעל-מ-run-office.sh — פתיחה-אוטונומית (תואם-לאחור) |
| `push-vaults.sh` | ✅ | דחיפה-לשני-הבתים + סריקת-סודות-על-כל-עץ-יוצא |
| `keys.env.enc` | ✅ | 17 סלוטים: OpenRouter×4 + Cloudflare + R2 + רשימות-מודלים |
| `ssh-keys.tar.enc` | ✅ | 4 מפתחות-פריסה + shim — חתומים-תחת-P |
| `wraps/*.enc` | **רק פרטי** | רישום-ההרשאות — לעולם לא בריפו ציבורי |
| `ssh/` | ❌ gitignored | מפתחות-פרסה-פתוחים (רק-על-מכונה-חיה) + `tool/` (GIT_SSH shim, מועלה כקוד) |
| `.session-pass` | ❌ gitignored | סיסמת-ההפעלה (600, נמחק-בסיבוב-הבא) |

## דחיפה לשני הבתים
```bash
bash vault/push-vaults.sh   # FleetHQ (ציבורי: ciphertext בלבד) + fleet-vault (פרטי: +wraps)
```

## חוקיות GitHub
deploy keys דרך ה-API הרשמי; ciphertext בריפו-ציבורי = מקובל (git-crypt/SOPS עושים-זאת);
אין-plaintext לעולם. פירוט: `SOVEREIGNTY.md` §6.4.
