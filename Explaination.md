# What Does Project S.A.R.A. Solve?

S.A.R.A. (Sustainable Analytics Recycling Assistant) is an AI-powered web platform that turns any smartphone into a waste-intelligence sensor. This document explains the problems it solves, who it solves them for, and how each part of the built platform maps to a specific problem.

---

## The Core Problem: Waste Management in Laos Is Flying Blind

Laos has a fast-growing waste crisis and almost no data about it:

- Laos generates roughly **6,900 tonnes of household waste per day**, and Vientiane alone accounts for 15% of the national total (KPL, 2026).
- Vientiane's waste generation **nearly doubled in a decade** — from 0.21 million tonnes (2012) to 0.37 million tonnes (2021) — and is still mostly handled by open dumping, open burning, and discharge into rivers (MDPI, 2024; WHO, 2024).
- The Lower Mekong countries produced about **8 million tonnes of plastic waste in 2020**, with 70–90% of it bottles, bags, and styrofoam (Mekong River Commission, 2022).
- National waste volume is projected to reach **1.4 million tonnes per year by 2035** (World Bank, 2022).

Behind these headline numbers sit four specific, day-to-day failures that S.A.R.A. is built to fix.

---

## Problem 1: Nobody Knows What to Do With an Item in Their Hand

**The gap.** Most people genuinely cannot tell whether an item is recyclable, what material it is, or how to prepare it for disposal (rinse it? crush it? which bin?). In Laos there is no widespread labeling system, no local recycling app, and no Lao-context guidance. The result: recyclable material goes to open dumps and burn piles by default.

**What S.A.R.A. does.** The Material Identifier (scanner) lets anyone point their phone camera at any item. A multimodal AI vision engine detects every object in the frame, draws a bounding box around each one, and returns:

- the item name and material (PET plastic, aluminum, glass, paper, organic, e-waste, hazardous),
- whether it is recyclable,
- a concrete disposal action ("Rinse, crush, and place in the blue recycling bin").

If the primary AI model is unavailable, the system automatically falls back through two more models, so the scanner keeps working. A filterable Disposal Guide backs this up with per-category local instructions, and an AI chat assistant answers follow-up questions. The decision that used to require expert knowledge now takes two seconds and zero training.

---

## Problem 2: Administrators Have Zero Real-Time Data

**The gap.** A campus sustainability officer in Laos today has no idea how much waste their campus generates, what kinds, where it accumulates, or whether any intervention is working. Decisions about bins, staffing, and collection schedules are guesses. The same is true at municipal level — which is why national policy (the World Bank-funded Pollution and Waste Management Project, the National Green Growth Strategy) struggles to target resources.

**What S.A.R.A. does.** Every scan silently logs ~200 bytes of metadata — item, category, GPS location, timestamp — to the cloud (never the photo itself; privacy by design). The Campus Digital Twin dashboard turns that stream into:

- a live heatmap of waste hotspots on an interactive campus map,
- marker clusters showing exactly what was scanned where,
- category breakdowns and time-filtered trends (today / week / month), refreshed every 15 seconds,
- real-time smart-bin fill levels, with bins automatically flagged "warning" or "full" and updates pushed instantly to administrators.

For the first time, a Lao institution can see its waste problem as data and act on it: put bins where the hotspots are, schedule collection before bins overflow, and measure whether recycling rates actually improve.

---

## Problem 3: Awareness Doesn't Translate Into Habit

**The gap.** 90% of Lao university students already recognize that poor waste management harms the planet (UNDP/Borgen, 2022) — yet behavior doesn't follow, because there is no feedback, no reward, and no visible community doing it. This is the classic intention–behavior gap documented in behavioral science.

**What S.A.R.A. does.** It wraps correct disposal in a habit loop:

- **ReGen Points** — every scan earns 10 points, tracked per user, with a 100-point daily cap so the system rewards genuine habit instead of point farming.
- **Community Feed** — students post tips and wins, like and comment, making sustainable behavior visible and socially normal (the "social proof" lever from the Theory of Planned Behavior).
- **Instant feedback** — the scan itself is satisfying: an immediate AI result, a clear instruction, points awarded on the spot.

The product converts a one-time good intention into a repeatable, rewarded, socially reinforced behavior.

---

## Problem 4: Sustainability Tools Don't Scale Across Institutions

**The gap.** Even where pilot projects exist, they are single-site, hardware-heavy, and die when the grant ends. There is no affordable way for the ~117 universities in Laos — let alone the ~700 reachable across the Greater Mekong Subregion — to adopt waste intelligence.

**What S.A.R.A. does.** The platform is multi-tenant and asset-light by construction:

- any university or company can **self-register as an organization**, receive a join code, and onboard its members in minutes;
- each organization manages its own bins, sees only its own data, and gets its own admin panel with member scan history;
- it runs in the browser on phones students already own — **no app-store install, no sensors, no hardware to buy**, on free-tier cloud infrastructure with near-zero burn rate.

This is what makes the $99/month university tier viable, and what makes expansion from one NUOL pilot to a national and then regional rollout a configuration change rather than a rebuild.

---

## The Bigger Picture: A Data Layer for Policies Laos Has Already Signed

Every problem above compounds into a national one: Laos has committed to a 60% emissions cut by 2030 (2021 NDC), a National Green Growth Strategy with waste as a pillar, and ASEAN Smart Cities Network membership for Vientiane and Luang Prabang — but it has no ground-truth waste data to plan with or report against.

S.A.R.A.'s GPS-tagged, timestamped scan dataset is exactly that missing data layer. Aggregated, it can feed municipal planning, national reporting, and bodies like the Mekong River Commission's riverine-plastic monitoring programme — turning thousands of student scans into evidence for policy.

## In One Sentence

**S.A.R.A. solves waste-management blindness: it tells individuals what to do with the item in their hand, shows institutions where their waste problem actually is in real time, makes the right behavior rewarding enough to become a habit, and packages all of it so any campus in the Mekong region can adopt it with nothing but the phones already in students' pockets.**
