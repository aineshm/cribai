/**
 * AIN-90 — marker for tool errors whose message is DELIBERATELY user-facing
 * (e.g. the guest sign-in gate). The LLM-first runtime streams these
 * verbatim; every other tool error is sanitized to a generic message so raw
 * internal crash details never reach the client. Keying off `instanceof`
 * (not message string matching) keeps the contract explicit at the throw
 * site.
 *
 * Lives in the tools layer (not runtime/) so both the throw sites
 * (executor / handlers) and `runtime/llm-turn.ts` can import it without a
 * dependency cycle.
 */
export class UserFacingToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingToolError';
  }
}
