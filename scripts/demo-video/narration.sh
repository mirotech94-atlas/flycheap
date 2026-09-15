#!/bin/bash
TTS=~/Library/Python/3.9/bin/edge-tts
V=en-US-AndrewNeural
R="-5%"
gen() { $TTS --text "$2" --voice $V --rate=$R --write-media "audio/$1.mp3"; }

gen 01-welcome "Welcome to FlyCheap Tracker — your personal fare intelligence platform. Here's the problem it solves: flight prices change dozens of times a day, and the good ones vanish within hours. FlyCheap watches over one thousand airlines around the clock, learns what a normal price looks like on your routes, and pings you the instant a fare drops below your target. In the next few minutes, I'll walk you through the entire product. This is the real dashboard, with live data — no mock-ups. Let's dive in."

gen 02-dashboard "This is the executive dashboard — the first thing you see when you sign in. Across the top, your key numbers: how many routes you're tracking, your total savings versus the ninety-day median, the cheapest pairing found right now, and any mistake fares caught in the last twenty-four hours. The globe is your live network — every arc is a route being monitored at this very minute. And the live feed streams every price movement as our pollers detect it — drops in green, and threshold crossings tagged as new lows."

gen 03-deals "The best deals table scans a full twelve months ahead, and ranks every date pairing on your route by price. Sweet-spot trip lengths are flagged, hot deals are marked, and each row carries a confidence score based on how that fare compares to its own history. And when you're ready to book, you're never locked in: every book button cross-shops the exact same itinerary on Aviasales, Google Flights, Kayak, Skyscanner, Momondo — or the airline directly. We never add a booking fee."

gen 04-calendar "The fare calendar is a twelve-month heat map of the cheapest price for every single day. Greener means cheaper, so seasonal patterns jump out immediately — click any green cell to filter the deals table to that date. Pair that with the buy-or-wait engine: it runs thirty days of trend and percentile analysis, and gives you a plain-English verdict — lock it in, or hold — with an explicit confidence percentage. No more guessing whether booking on a Tuesday at midnight is a real thing."

gen 05-explore "Not sure where to go? The explore page flips the question around. Pick your home airport, and see the cheapest fare to every reachable destination on Earth, color-coded on an interactive map. Filter by budget, by month, or by region. It's the fastest way to turn 'somewhere warm in February' into an actual booked trip."

gen 06-alerts "Now, the heart of the product: alerts. On your watchlist, every route has a target price per adult. Choose your trigger: a threshold cross, which fires the moment the fare dips below your number — or an anomaly alert, when a price falls significantly under its own seven-day median. Email alerts are on for everyone. Pro unlocks S-M-S, WhatsApp, and Telegram — each one is a single toggle, no bot setup required. You can also tune polling frequency, party size, and date windows per route."

gen 07-concierge "Meet the AI concierge — a Claude-powered assistant with live access to your fare data. Ask it anything in plain English — like, find the cheapest two weeks to Cairo in September under eight hundred dollars per adult — and it queries your actual data and answers with real numbers, not guesses. It's like having a travel analyst on staff, around the clock."

gen 08-pricing "Getting started takes about thirty seconds. The free tier gives you five tracked routes, a daily digest, and worldwide explore — no credit card required. Pro is nine dollars a month after a fourteen-day free trial, and adds unlimited routes, priority five-minute polling, buy-or-wait predictions, and every alert channel. Enterprise adds white-label branding and a full A-P-I for travel desks. Stop refreshing flight sites. Set it once — and let FlyCheap watch forever."
