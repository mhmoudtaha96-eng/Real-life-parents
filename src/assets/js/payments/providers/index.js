import { registerProvider } from '../registry.js';
import { instapay } from './instapay.js';
import { card } from './card.js';
import { bank } from './bank.js';

// Order here = order in the payment-method picker.
[instapay, bank, card].forEach(registerProvider);
