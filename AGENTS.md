# AGENTS.md

## Project
Ambe Pharma Intelligence is a production-minded internal tool for a UK pharmaceutical wholesale business.

## Goals
Build a maintainable MVP that helps operators answer:
1. What should we buy today?
2. What should we sell or push today?
3. What stock is at risk?
4. Which customers should we contact?

## Engineering principles
- Prefer simple, readable solutions
- Use TypeScript everywhere
- Preserve existing behavior unless asked to change it
- Make the smallest clean implementation that works
- Do not add unnecessary abstractions
- Do not commit secrets
- Use `.env.example` placeholders only
- Add tests for core logic where practical
- Add README updates when introducing new setup steps
- Inspect existing code before changing it

## Backend preferences
- Node.js + TypeScript
- Express
- Prisma + PostgreSQL
- Clear service / route / schema separation
- Deterministic business rules first, no AI-first logic

## Frontend preferences
- Next.js + TypeScript
- Clean internal admin UI
- Functional over flashy
- Good loading and error states

## Business rules
- Human approval required before customer-facing publishing
- Preserve source data from imports
- Keep scoring explainable
- Keep legal entity and license-related settings configurable
- Separate internal alerts from customer-facing offers

## Delivery expectations
When implementing:
1. Inspect existing code first
2. Make the smallest viable change
3. Explain files changed
4. Include run/test steps
5. Note assumptions