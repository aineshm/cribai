export interface LeaseTerm {
  readonly term: string;
  readonly category: 'deposit' | 'lease' | 'rights' | 'eviction' | 'maintenance';
  readonly explanation: string;
}

export const LEGAL_DISCLAIMER =
  "This is general educational information, NOT legal advice. For your specific situation, consult your university's student legal services or a licensed attorney.";

export const LEASE_TERMS: readonly LeaseTerm[] = [
  // ── deposit ──────────────────────────────────────────────────────
  {
    term: 'Security Deposit',
    category: 'deposit',
    explanation:
      'A refundable sum paid before move-in to cover potential damages beyond normal wear and tear. Most states cap the amount (commonly one to two months\u2019 rent) and require landlords to return it within a specific timeframe after move-out, often 14\u201330 days.',
  },
  {
    term: 'Last Month\u2019s Rent',
    category: 'deposit',
    explanation:
      'An upfront payment equal to one month\u2019s rent that is applied to your final month of tenancy. Unlike a security deposit, it cannot be used to cover damages. Some jurisdictions treat it as a deposit and require it to be held in a separate account.',
  },
  {
    term: 'Pet Deposit',
    category: 'deposit',
    explanation:
      'An additional refundable deposit charged when a tenant keeps a pet on the premises. It covers potential pet-related damage such as stains, scratches, or odors. Some landlords charge non-refundable pet fees instead; know the difference before signing.',
  },
  {
    term: 'Deposit Interest',
    category: 'deposit',
    explanation:
      'Several states and municipalities require landlords to hold security deposits in interest-bearing accounts and pay accumulated interest to the tenant upon move-out. Check your local laws\u2014failure to comply can entitle you to additional penalties.',
  },
  {
    term: 'Normal Wear and Tear',
    category: 'deposit',
    explanation:
      'Deterioration that occurs from ordinary, day-to-day use of the property\u2014faded paint, minor scuff marks, worn carpet in high-traffic areas. Landlords may not deduct from your deposit for normal wear and tear; deductions are limited to damage beyond reasonable use.',
  },
  {
    term: 'Deposit Return Timeline',
    category: 'deposit',
    explanation:
      'The legally mandated period within which a landlord must return your security deposit (or provide an itemized deduction statement) after you vacate. Timelines vary by state\u2014commonly 14 to 30 days. Missing the deadline may entitle you to the full deposit plus penalties.',
  },

  // ── lease ────────────────────────────────────────────────────────
  {
    term: 'Joint and Several Liability',
    category: 'lease',
    explanation:
      'When multiple tenants sign a single lease, each is individually responsible for the entire rent\u2014not just their share. If one roommate stops paying, the landlord can pursue any or all remaining tenants for the full amount owed.',
  },
  {
    term: 'Subletting',
    category: 'lease',
    explanation:
      'Renting out your unit (or part of it) to a third party while your lease is still active. You remain responsible to the landlord. Most leases require written landlord consent before subletting; doing so without permission can be grounds for eviction.',
  },
  {
    term: 'Lease Assignment',
    category: 'lease',
    explanation:
      'Transferring your entire lease obligation to a new tenant. Unlike subletting, you are generally released from further liability once the landlord approves the assignment. The new tenant takes over all rights and duties under the original lease.',
  },
  {
    term: 'Early Termination',
    category: 'lease',
    explanation:
      'Breaking a lease before its end date. Consequences typically include a penalty fee (often one to two months\u2019 rent), forfeiture of the security deposit, and potential liability for rent until the unit is re-leased. Some leases include a specific early-termination clause that defines the fee.',
  },
  {
    term: 'Lease Renewal',
    category: 'lease',
    explanation:
      'The process of extending your lease for another term. Landlords may offer renewal at the same or increased rent. Pay attention to renewal deadlines\u2014many leases auto-renew or convert to month-to-month if neither party provides written notice within a specified window.',
  },
  {
    term: 'Month-to-Month Tenancy',
    category: 'lease',
    explanation:
      'A rental arrangement that automatically renews each month until either party gives proper notice (usually 30 days). It offers flexibility but less stability\u2014the landlord can raise rent or end the tenancy with relatively short notice.',
  },
  {
    term: 'Co-Signer / Guarantor',
    category: 'lease',
    explanation:
      'A third party (often a parent) who agrees to be financially responsible if the tenant fails to pay rent or damages the property. The co-signer is legally bound by the lease and can be sued for unpaid rent just like the tenant.',
  },
  {
    term: 'Lease Break Fee',
    category: 'lease',
    explanation:
      'A predetermined fee written into the lease that a tenant pays to terminate the agreement early without further liability. It provides certainty for both parties and is typically one to two months\u2019 rent. Not all leases include one\u2014read carefully before signing.',
  },

  // ── rights ───────────────────────────────────────────────────────
  {
    term: 'Quiet Enjoyment',
    category: 'rights',
    explanation:
      'The tenant\u2019s right to use and enjoy the rental without unreasonable interference from the landlord or other tenants. Violations include excessive unannounced visits, failure to address noise complaints, or allowing construction that makes the unit uninhabitable.',
  },
  {
    term: 'Implied Warranty of Habitability',
    category: 'rights',
    explanation:
      'A legal doctrine requiring landlords to maintain rental properties in a condition fit for human habitation. This includes working plumbing, heating, electricity, structural integrity, and freedom from pest infestations. Tenants cannot waive this right.',
  },
  {
    term: 'Right of Entry',
    category: 'rights',
    explanation:
      'The landlord\u2019s right to enter the rental unit for repairs, inspections, or showings. Most states require advance written notice (commonly 24\u201348 hours) and limit entry to reasonable hours, except in emergencies such as fire or flooding.',
  },
  {
    term: 'Privacy Rights',
    category: 'rights',
    explanation:
      'Tenants have a right to privacy within their rented unit. Landlords cannot install surveillance inside the unit, enter without proper notice, or share your personal information without consent. Violations may constitute harassment or illegal entry.',
  },
  {
    term: 'Retaliation Protection',
    category: 'rights',
    explanation:
      'Laws in most states prohibit landlords from retaliating against tenants who exercise their legal rights\u2014such as filing a complaint with a housing authority, requesting repairs, or joining a tenant\u2019s union. Retaliation can include rent increases, reduced services, or eviction attempts.',
  },

  // ── eviction ─────────────────────────────────────────────────────
  {
    term: 'Eviction Notice',
    category: 'eviction',
    explanation:
      'A formal written notice from the landlord informing the tenant of a lease violation and the intent to begin eviction proceedings if the issue is not resolved. The notice must comply with state law regarding format, delivery method, and timeframe.',
  },
  {
    term: 'Cure or Quit Notice',
    category: 'eviction',
    explanation:
      'A type of eviction notice that gives the tenant a specified period (often 10\u201330 days) to fix (\u201ccure\u201d) a lease violation\u2014such as unauthorized pets or noise complaints\u2014or vacate (\u201cquit\u201d) the premises. If the tenant cures the violation, the landlord cannot proceed with eviction.',
  },
  {
    term: 'Pay or Quit Notice',
    category: 'eviction',
    explanation:
      'A notice demanding the tenant pay overdue rent within a short period (typically 3\u201314 days depending on the state) or vacate the unit. If the tenant pays in full within the deadline, the landlord must accept payment and cannot proceed with eviction.',
  },
  {
    term: 'Unlawful Eviction',
    category: 'eviction',
    explanation:
      'Any attempt by a landlord to force a tenant out without following the legal eviction process. Examples include changing locks, shutting off utilities, removing belongings, or threats. Tenants subject to unlawful eviction can seek damages and an injunction in court.',
  },
  {
    term: 'Eviction Process',
    category: 'eviction',
    explanation:
      'The legal procedure a landlord must follow to remove a tenant: (1) serve proper written notice, (2) file an eviction lawsuit if the tenant does not comply, (3) attend a court hearing, and (4) obtain a court order before a sheriff enforces the removal. Self-help evictions are illegal.',
  },

  // ── maintenance ──────────────────────────────────────────────────
  {
    term: 'Repair and Deduct',
    category: 'maintenance',
    explanation:
      'A remedy available in many states allowing tenants to arrange and pay for essential repairs the landlord has failed to make after proper notice, then deduct the cost from future rent. Strict procedural requirements apply\u2014document everything and check local limits on the deductible amount.',
  },
  {
    term: 'Maintenance Responsibility',
    category: 'maintenance',
    explanation:
      'The allocation of repair duties between landlord and tenant. Generally, landlords handle structural, plumbing, electrical, and HVAC systems, while tenants are responsible for keeping the unit clean and reporting issues promptly. Lease terms may assign additional duties.',
  },
  {
    term: 'Emergency Repairs',
    category: 'maintenance',
    explanation:
      'Repairs needed to address immediate hazards\u2014burst pipes, gas leaks, no heat in winter, or electrical failures. Landlords are typically required to respond within 24 hours. In many jurisdictions, tenants may arrange emergency repairs themselves if the landlord is unreachable and deduct costs from rent.',
  },
  {
    term: 'Habitability Standards',
    category: 'maintenance',
    explanation:
      'The minimum conditions a rental unit must meet to be legally occupied: functioning plumbing, hot and cold water, heating, electricity, smoke detectors, weatherproofing, and freedom from serious pest infestations. Failure to maintain these standards can give tenants the right to withhold rent or terminate the lease.',
  },
] as const;

export function findLeaseTerm(searchTerm: string): LeaseTerm | undefined {
  if (searchTerm.trim() === '') return undefined;
  const normalized = searchTerm.toLowerCase();
  return LEASE_TERMS.find(
    (t) =>
      t.term.toLowerCase().includes(normalized) ||
      normalized.includes(t.term.toLowerCase()),
  );
}
