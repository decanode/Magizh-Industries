// Customer and supplier master maintenance. One controller is built per party type.
const { pickPartyFields, normalizePartyFields, validateParty } = require('../utils/partyValidation');

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

const createPartyController = (service, label) => {
  const buildList = (archived) => async (req, res) => {
    try {
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, parseInt(req.query.pageSize, 10) || DEFAULT_PAGE_SIZE));

      const all = await service.list({ search: req.query.search || '', archived });
      const start = (page - 1) * pageSize;

      res.status(200).json({
        items: all.slice(start, start + pageSize),
        page,
        pageSize,
        total: all.length,
        totalPages: Math.max(1, Math.ceil(all.length / pageSize))
      });
    } catch (error) {
      res.status(500).json({ message: `Failed to load ${label}s`, error: error.message });
    }
  };

  return {
    list: buildList(false),
    listArchived: buildList(true),

    getById: async (req, res) => {
      try {
        const item = await service.getById(req.params.id);
        if (!item) return res.status(404).json({ message: `${label} not found` });
        res.status(200).json({ item });
      } catch (error) {
        res.status(500).json({ message: `Failed to load ${label}`, error: error.message });
      }
    },

    create: async (req, res) => {
      try {
        const data = normalizePartyFields(pickPartyFields(req.body));
        const errors = validateParty(data);
        if (errors.length) return res.status(400).json({ message: errors[0], errors });

        const item = await service.create(data, req.user.userId);
        res.status(201).json({ message: `${label} created successfully`, item });
      } catch (error) {
        res.status(500).json({ message: `Failed to create ${label}`, error: error.message });
      }
    },

    update: async (req, res) => {
      try {
        const data = normalizePartyFields(pickPartyFields(req.body));
        const errors = validateParty(data, { partial: true });
        if (errors.length) return res.status(400).json({ message: errors[0], errors });

        const item = await service.update(req.params.id, data, req.user.userId);
        if (!item) return res.status(404).json({ message: `${label} not found` });
        res.status(200).json({ message: `${label} updated successfully`, item });
      } catch (error) {
        res.status(500).json({ message: `Failed to update ${label}`, error: error.message });
      }
    },

    archive: async (req, res) => {
      try {
        const archived = await service.archive(req.params.id, req.user.userId);
        if (!archived) return res.status(404).json({ message: `${label} not found` });
        res.status(200).json({ message: `${label} archived successfully` });
      } catch (error) {
        res.status(500).json({ message: `Failed to archive ${label}`, error: error.message });
      }
    },

    restore: async (req, res) => {
      try {
        const restored = await service.restore(req.params.id, req.user.userId);
        if (!restored) return res.status(404).json({ message: `Archived ${label.toLowerCase()} not found` });
        res.status(200).json({ message: `${label} restored successfully` });
      } catch (error) {
        res.status(500).json({ message: `Failed to restore ${label}`, error: error.message });
      }
    }
  };
};

module.exports = createPartyController;
