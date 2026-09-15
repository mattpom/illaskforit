# I'll Ask For It — Affiliate Monetization Audit

Date: 2026-09-15
Status: execution baseline

## Verified findings

- The repository contains an affiliate disclosure page identifying participation in Amazon Associates and the required Amazon qualifying-purchases statement.
- No `affiliate_click` implementation was found in the default-branch code search during this audit.
- No MatPom Digital Ventures ownership wording was found in the default-branch code search during this audit.
- Public search did not surface reliable current indexed results for the domain during this pass; repository evidence is therefore the primary source until live/index verification is completed.

## Corrections / implementation rules

1. Preserve the site's opinion/commentary identity. Do not add sitewide product grids.
2. Monetize only articles with a natural commercial next action: a reviewed item, meaningful comparison, travel booking, or relevant local visit.
3. Keep most editorial articles free of affiliate modules.
4. Add standardized GA4 `affiliate_click` measurement before scaling affiliate placements.
5. Affiliate links must use clear adjacent disclosure and `rel="sponsored nofollow noopener"` for merchant destinations.
6. Do not invent an Amazon tracking tag or attach a tag until the exact approved site tag is verified.
7. Add MatPom Digital Ventures, LLC ownership wording in the legal/footer layer when implementing the company-wide ownership standard.
8. Preserve Indianapolis as a dedicated category while the site is repositioned nationally.

## Conversion priorities

- Reviews/rankings with genuine purchase intent
- Travel recommendations with a verified booking partner
- Indianapolis/local recommendations where a legitimate booking or commerce action exists
- Contextual single-product recommendations when directly relevant

## Avoid

- unrelated Amazon links
- generic "best products" filler
- monetizing opinion pieces simply because they receive traffic
- unverified superlatives or personal-use claims
- stale prices
- unverified affiliate IDs

## QA gate before production

- exact partner IDs verified
- affiliate click event tested
- disclosures visible before/adjacent to first monetized recommendation
- merchant links checked
- mobile layout checked
- national navigation/Indianapolis category preserved
