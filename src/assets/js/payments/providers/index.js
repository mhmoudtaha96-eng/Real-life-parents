import { registerProvider } from '../registry.js';
import { instapay } from './instapay.js';
import { card } from './card.js';

// Order here = order in the payment-method picker.
[instapay, card].forEach(registerProvider);
