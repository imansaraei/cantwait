# Can't Wait — Product & Visual Design Plan

> **"When you have 20 content or product ideas, how do you know which one your audience actually wants next? The answer: Can't Wait."**

## 1. Product Overview
**Can't Wait** is an async focus-group feedback space for creators, writers, and builders.
- **Creators / Founders** drop raw ideas for upcoming **content** (YouTube videos, essays, podcasts, threads) or **products** (features, micro-apps, tools).
- **Focus Group Members** receive a continuous, bite-sized swipe feed of unvoted ideas and swipe **Right ("Can't Wait!")** or **Left ("Pass")**.
- **Popularity Pulse** ranks ideas by excitement ratio, total "Can't Wait" votes, and recency so the creator knows exactly what to build or publish next.

---

## 2. Core User Flows

### A. Creator Flow
1. **Create Focus Group Space**: Creator names their space (e.g., *"Iman's Lab"*), gets a shareable invite link (`/join/LAB24`).
2. **Drop an Idea**: Quick composer with:
   - **Type**: `Content` (Video, Article, Post) or `Product` (Feature, App, Tool)
   - **Title** + **Hook / One-Liner**
   - **Optional**: Target audience or "Why now?" note
3. **Popularity Pulse**: Live ranked feed showing:
   - **Can't Wait %** (e.g. `88%` excited)
   - **Vote breakdown** (`14 Can't Wait` · `2 Pass`)
   - **Status**: `In Queue`, `In Progress`, `Shipped / Published` (creators can mark winners as shipped!)

### B. Focus Group Member Flow
1. **Join via Link**: One-tap join (Google Sign-In or Guest nickname).
2. **Swipe Feed**: Only sees ideas they haven't voted on yet.
   - **Swipe Right / `→`**: *"Can't Wait!"* (high-energy coral/amber stamp)
   - **Swipe Left / `←`**: *"Pass"* (muted slate stamp)
   - **Undo (`Z`)**: Instant revert if swiped by mistake.
3. **Caught Up State**: Clean empty state when all current ideas are voted on, with a toggle to view **What's Winning** (if creator enables public results).

---

## 3. Visual & Color Design Directions (3 Mockup Concepts)

We drafted **3 distinct visual directions** in `docs/mockups.html` to compare side-by-side:

| Concept | Palette | Vibe & Typography | Best For |
| :--- | :--- | :--- | :--- |
| **1. Warm Editorial** *(Recommended)* | Warm Cream `#FAF9F6`, Charcoal `#18181B`, Electric Coral `#FF5A36` | Editorial serif/sans mix, tactile paper cards, friendly & creator-centric | Content creators, writers, indie makers |
| **2. Neo-Brutalist Pop** | Crisp White `#FFFFFF`, Ink Black `#0A0A0A`, Acid Lime `#BEF264` & Hot Coral `#FB7185` | Bold 2px black borders, hard offset shadows, punchy geometric type | High-energy consumer apps, Gen-Z / design audiences |
| **3. Midnight Velvet** | Deep Plum-Black `#0F0B14`, Velvet Card `#1A1423`, Neon Amber `#F59E0B` & Rose `#F43F5E` | Sleek dark mode with warm ember accents (distinct from IdeaSwipe's cold indigo) | Night-owl builders, product teams |

---

## 4. Technical Architecture
- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend / Auth**: Firebase Auth (Google Sign-In) + Firestore real-time listeners
- **Hosting**: Cloudflare Pages (`cantwait.imansaraei.com`)
- **PWA**: Installable web app with optional push notifications when the creator drops new ideas.
