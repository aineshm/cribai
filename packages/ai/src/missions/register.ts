/**
 * register.ts — Side-effect-only module that registers all mission pipelines.
 *
 * Import this module wherever the mission registry must be populated before
 * use.  Both the missions barrel (index.ts) and the standalone GH Actions
 * worker (worker.ts) import this file so there is a single, auditable list
 * of all registered mission types.
 *
 * Tree-shaking note: this module is declared in the package.json
 * `sideEffects` array so bundlers never strip these imports.
 */

import './housing-search/index';
import './tour-outreach-mission';
import './listing-deep-dive/index';
import './sublease-post/index';
import './crm-deep-extract/index';
