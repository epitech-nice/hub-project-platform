const Printer = require('../../models/Printer');
const PrintAuthorization = require('../../models/PrintAuthorization');
const { generateApiKey } = require('../../utils/apiKey');

const createPrinter = async (overrides = {}) => {
  const { rawKey, hash } = generateApiKey();
  const printer = await Printer.create({
    name: 'Kobra 3 - Test',
    model: 'kobra3',
    apiKeyHash: hash,
    ...overrides,
  });
  return { printer, rawKey };
};

const whitelistEmail = async (email, authorized = true) =>
  PrintAuthorization.create({ email, authorized });

const printerAuthHeader = (printerId, rawKey) => ({
  'x-printer-id': printerId.toString(),
  'x-api-key': rawKey,
});

module.exports = { createPrinter, whitelistEmail, printerAuthHeader };
