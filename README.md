# Helios.AI

Helios merges everyone's jorunal ammendment to a consitution.

1. new bus stop to french place
2. pls make a bridge from new york to france
![bus_stop](image_1.png)
![bridge](bridge.png)

20 journals → 20 possible changes
What someone writes in their journal	What HELIOS proposes
🚌 "Please put a bus stop near my house."	Neighborhood Mobility Act — Improve transit access in underserved neighborhoods.
🌉 "Build a bridge from New York to France."	Transatlantic Connection Initiative — Study radically better ways to cross oceans.
🏡 "My rent is too expensive. I want to live near my friends."	Affordable Homes Initiative — Make it easier to build homes where people want to live.
🌳 "I wish every street had trees."	Green Streets Initiative — Expand neighborhood shade and urban forests.
🐕 "I want to bring my dog on the bus."	Pet-Friendly Transit Pilot — Test safe, accessible pet policies on public transit.
🍕 "Everyone should get free pizza on Fridays."	Community Meals Pilot — Test neighborhood gatherings and shared meals.
💻 "I wish everyone could learn to code for free."	Universal Learning Initiative — Expand free access to digital education.
❤️ "I'm lonely. I wish there were somewhere to meet people."	Third Places for Everyone Act — Create accessible public spaces for friendship and community.
🏥 "My mom waited six months to see a doctor."	Timely Healthcare Access Initiative — Reduce unreasonable delays in essential care.
🧠 "I want an AI that remembers everything I learn."	Personal Knowledge Freedom Act — Give people control over portable, private AI memory.
🚲 "Cars drive too fast near my school."	Safe Streets Initiative — Improve pedestrian safety around schools.
🌊 "My street floods every time it rains."	Flood Resilience Initiative — Upgrade drainage infrastructure where risks are highest.
🧑‍🚀 "I want to visit the Moon someday."	Space Access Initiative — Support safe, increasingly accessible space exploration.
🗳️ "I don't know what my mayor voted for yesterday."	Transparent Government Act — Make public decisions easy to find and understand.
🏖️ "I wish I had more time with my family."	Work-Life Balance Initiative — Explore shorter workweeks and flexible work arrangements.
🧬 "Why can't scientists share their discoveries for free?"	Open Science Initiative — Expand public access to publicly funded research.
🎮 "I want to explore my city 100 years in the future."	Public Simulation Initiative — Let communities explore possible futures before making policy decisions.
🌍 "I wish I could talk to anyone, regardless of language."	Universal Translation Initiative — Expand access to multilingual communication tools.
🧪 "I want a communal science lab in every city."	Public Science Labs Initiative — Establish shared spaces for experimentation and invention.
🕊️ "Why can't countries solve disagreements without wars?"	Peaceful Cooperation Initiative — Strengthen international conflict prevention and mediation.

"Today I got rejected from an apartment by an AI. Nobody could tell me why. I couldn't even talk to a human.

I don't think computers should be allowed to make important decisions about our lives without explaining themselves.

Maybe everyone should have the right to ask why?"


Helios HTML is a ice cream model. It's sole purpose is to create new flavors of ice cream.!
Ice cream tastes good when you smoke weed. I highly reccomend this.

Helios AI is a civic tool that reads what everyone in a community says they need and groups the needs people share, like safer crossings or later clinic hours. It then drafts a plan in which every line links back to the needs behind it, so you can always see why it says what it says. Helios drafts and revises, but people vote, and nothing becomes the plan without their approval.

## What's in this repo

- `index.html` — merged entry page with tabs that switch between the embedded pages
- `helios_ai_landing_page.html` — the Helios AI landing page
- `helios_hippie_landing.html` — HeliosAI hippie-style landing page ("8 billion people, one big circle")
- `helios_fork.html` — Fork Helios page with GitHub fork button, setup instructions and static preview (`/embed/fork`)
- `world_plan_simulator.html` — World Plan Simulator: a synthetic year of daily journal pages from 8.2 billion people, turned into needs, a plan and a regional vote (served at `/embed/world-plan`)
- `helios_100_frontend_demo.html` — 100 Shared Goals demo
- `helios_notion_preview.html` — the plan as a Notion document, synced through the Notion API ([docs](docs/notion.md))
- `helios-unified.html` — Helios Unified (Universe · Communal Science Lab · Futures)
- `communal_science_lab_webgpu (1).html` — the Communal Science Lab (WebGPU)

## Running locally

```sh
bun install
bun run dev
```

Then open http://localhost:3000/ or http://localhost:3000/laws. Without `SUPABASE_DB_URL` the dev server keeps the 100 goals, proposals and amendment history in a local PGlite database (`.data/pglite`). Browser-local demo notes remain local. See [backend and deployment documentation](docs/backend.md) for the API, the Supabase database, the Netlify functions and the SQLite migration.





-----------ideas_
I would create **The World Commons** — a democratic institution that countries voluntarily participate in every week through a journaling app.

Its central idea:

> **Every person deserves a voice. Every country deserves a seat. Every week, humanity should understand itself a little better.**

I would call the evolving record of shared agreements **The Living Accord**, rather than a constitution.

The goal isn't to create a world government. It's to create a trusted global conversation that makes cooperation easier.

## **1. The institution**

# **THE WORLD COMMONS**

A weekly democratic conversation for humanity

**Millions of personal journals**

People describe their experiences, concerns and hopes

**HELIOSAI synthesis**

Translate, identify common ground, preserve disagreements

**Citizens + country representatives**

Deliberate independently and recommend action

**The Living Accord**

A public, versioned record of voluntary agreements and results

There are currently 193 UN member states, so I'd treat 300 as your proposed network capacity, potentially including participating territories or other civic jurisdictions rather than claiming 300 sovereign states.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://ask.un.org\&sz=32)

Ask DAG!



## **2. Make the journal the center of democracy**

Imagine everyone receives three questions each Sunday.

**World Commons**

Week 47

## **How is your world this week?**

Three reflections. About three minutes.

1\. What got better in your life this week?

2\. What's making life harder?

3\. What is one change you'd like to see?

Sharing preference

Keep private

Permit anonymized synthesis

Permit public sharing

&#x20;Copy journal entryThis is a prototype of the weekly journal, not a connected submission form.

The important distinction is that **journaling is listening, not voting**. People must separately consent to sharing, deliberate on proposals, and cast meaningful votes. Raw journals should never automatically become public political records.

## **3. Why would 300 participants want to join?**

The institution must provide an advantage even to countries that disagree with each other.

| What countries want  | What the Commons provides                                 |
| -------------------- | --------------------------------------------------------- |
| Sovereignty          | Participation never transfers national authority          |
| Better information   | A weekly, translated report of public priorities          |
| Equal respect        | One country, one seat in the country chamber              |
| Influence            | The ability to propose and amend initiatives              |
| Economic opportunity | Access to voluntary multinational pilot projects          |
| Trust                | Open rules, independent audits, and visible disagreements |

I'd use a **two-chamber system**: a chamber of participating countries and a citizen chamber selected through representative civic lotteries, not just app popularity. A joint recommendation could require a two-thirds majority in each chamber; implementation still requires each participating government's affirmative consent.

This borrows from research on representative deliberative democracy, including citizens' assemblies, rather than relying on unrepresentative online polls.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.oecd.org\&sz=32)

OECD



## **4. A seven-day democratic heartbeat**

| Day            | What happens                                                    |
| -------------- | --------------------------------------------------------------- |
| Monday–Tuesday | People journal, in their preferred language                     |
| Wednesday      | HELIOSAI creates summaries, with minority and dissenting views  |
| Thursday       | Citizens deliberate on a small set of proposals                 |
| Friday         | Country representatives respond and propose amendments          |
| Saturday       | Both chambers vote on recommendations                           |
| Sunday         | Publish the Weekly Accord and report on last week's commitments |

Every proposal gets a permanent history: the original concern, supporting evidence, objections, votes, commitments, outcomes and subsequent amendments.

Taiwan's vTaiwan is a useful precedent: it combines online consultation, tools such as Pol.is, and participation from government, experts and the public.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://info.vtaiwan.tw\&sz=32)

info.vtaiwan.tw



## **5. Where your existing projects fit**

**Digital Pensieve / Reflect Open** — collect individual reflections

**HELIOSAI** — have five AI models interpret themes and challenge each other's conclusions, with human review

**Civic Synthesis** — run transparent deliberation, proposals and voting

**HappyBearLandia** — simulate potential consequences and compare possible futures

**The Living Accord** — publish decisions, commitments and what actually happened

The AI systems should help people understand possibilities, not decide what humanity believes.

## **6. How I would launch it**

I'd start with 10 voluntary pilot communities across several regions, recruit independent civic organizations and interested public officials, and run four weekly cycles. The first goal is not worldwide adoption; it's proving that people receive a meaningful response to what they share.

I'd measure weekly participation, representativeness, translation quality, the share of proposals that receive responses, and whether participants can identify a concrete result from prior weeks.

Three safeguards would be nonnegotiable: no political surveillance through private journal data, no corporate or government control over AI summaries, and no claim that a vote represents an entire population without representative participation.

This is also compatible in spirit with the UN's existing Global Digital Compact, which emphasizes inclusive participation, human rights and digital cooperation.&#x20;

[image](https://www.google.com/s2/favicons?domain=https://www.un.org\&sz=32)

Pact for the future



## **7. What I would call everything**

**The World Commons**

The global democratic institution.

My pick

**The Weekly Pulse**

The recurring journal and report on what people are experiencing.

**The Living Accord**

The evolving record of shared commitments.

**The Commons Assembly**

The democratic deliberation and recommendation process.

The most important product feature is the sentence each participant sees when they return:

**"Last week, you told us what mattered. Here's what the world heard, what people disagreed about, and what changed."**

That feedback loop is what could turn a journaling app into a real democratic institution people voluntarily return to every week.





1. blockers
2. story humor
3. compute (webgpu on phones - not possible to process all data w/o this)
4. manufacturing

data needed for app
see everyone elses vote using deckgl map



1. Congratulations you are now an emperor of happybearlandia, along with everyone else.
2. HappyBearLandia - a network state that supports all nation governements.
3. https://www.amazon.com/dp/0226458083?lv=shuf&hvlocphy=9060296&hvptwo=&hvnetw=g&mcid=&hvext=374113057759&hvadid=812928502684&language=en_US&hvpone=&hvlocint=&hvcampaign=23946687805&hydadcr=11477_13715379_2515069&hvpos=&hvdev=c&hvdvcmdl=&hvocijid=2715868225355794285--&hvqmt=a&hvexpln=0&tag=smgglusdsadts-20&hvtargid=kwl-2484167636399&adgrpid=195855866805&hvrand=2715868225355794285&channelId=500&ref_=&plpRedirect=mhFallback&th=1

# happy bear landia has 2 responsiblities
1. visualize constitution of each country / city
2. simulate how edits to that document would affect simulation behavior
