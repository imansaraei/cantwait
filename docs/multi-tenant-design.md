# Can't Wait — Multi-Tenant Labs & Daily Notifications Design

## 1. Core Decisions
- **Sign-In Required**: Users must sign in (Google or Email + 6-digit Code) before creating a Lab, joining via invite link (`?code=XXXXXX`), or swiping on ideas. Prevents duplicate votes across devices.
- **Multi-Lab Workspace Switcher**: Any signed-in user can:
  - **Create their own Lab** (Focus Group) tied to their `uid` (`ownerId`).
  - **Join other creators' Labs** via invite code/link and switch between *My Labs* and *Joined Labs* in a clean Luma-style dropdown/sheet.
- **Daily Participant Notifications**:
  - **Lab Owner**: Configures a daily check-in schedule on the Lab (`enabled`, `time` e.g. `09:00`, `timezone`).
  - **Participants**: Toggle **Daily Reminders** for a Lab (`Notification.requestPermission()`), storing their subscription preference on their membership record.

---

## 2. Firestore Data Model (`ideaswipe-45332`)
*(With seamless `localStorage` fallback when Firestore is offline or uninitialized.)*

1. `labs/{labId}`
   - `id`, `code` (6-char uppercase, e.g. `LAB24`), `name`, `ownerId`, `ownerName`
   - `memberIds: string[]`
   - `schedule: { enabled: boolean; time: string; timezone: string }`
   - `createdAt: number`
2. `labs/{labId}/ideas/{ideaId}`
   - `id`, `type` (`Content` | `Product`), `format`, `title`, `hook`
   - `cantWaitCount: number`, `passCount: number`, `status` (`queued` | `building` | `shipped`)
   - `createdAt: number`
3. `labs/{labId}/votes/{uid}_{ideaId}`
   - `userId`, `ideaId`, `vote` (`cantwait` | `pass`), `timestamp: number`
4. `users/{uid}`
   - `uid`, `email`, `displayName`, `joinedLabIds: string[]`, `notifyLabIds: string[]`

---

## 3. UI & Flow Changes (Luma iOS Style)
1. **Auth Gate**: Unauthenticated visitors see a clean Luma-style welcome/sign-in card (preserving `?code=XXXXXX` so they land straight in the invited Lab after signing in).
2. **Lab Switcher Pill (Header)**: Clicking the Lab name opens a clean popover/modal to:
   - Switch between owned & joined Labs
   - **+ Create New Lab** (Name + optional Daily Notification time)
   - **Join Lab by Code**
3. **Lab Settings & Notifications**:
   - **Owner**: Gear icon next to Lab code opens **Lab Settings** (edit Lab name, copy invite link `https://cantwait.imansaraei.com/?code=...`, configure Daily Reminder time, and **Sync Google Sheet**).
   - **Participant**: Bell toggle in header enables/disables daily reminders for the active Lab.
4. **Google Sheets Sync (Owner)**:
   - Accepts any Google Sheet URL/ID shared as **"Anyone with the link"** via `https://docs.google.com/spreadsheets/d/{SHEET_ID}/export?format=csv`.
   - Parses 5 columns: `no`, `One-liner Description`, `Full Description`, `Further Read/Listen`, and `Pot` (`yes`/`true`/`1`/`pot` = active in swipe feed; otherwise excluded/archived).
   - Includes a **Download Blank Template (.csv)** button for reference and preserves existing vote counts on re-sync.
5. **Owner-Only Controls**:
   - `+ Drop Idea`, Google Sheet Sync, and status cycling (`In Queue` → `In Progress` → `Shipped`) are enabled only when `user.uid === activeLab.ownerId`.
