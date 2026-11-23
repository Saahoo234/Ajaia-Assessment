import sanitizeHtml from 'sanitize-html';
export const SEED_USERS = [
  { id: 'alice', name: 'Alice Johnson', email: 'alice@demo.test' },
  { id: 'bob', name: 'Bob Smith', email: 'bob@demo.test' },
  { id: 'charlie', name: 'Charlie Lee', email: 'charlie@demo.test' }
];
export const isKnownUser = (id) => SEED_USERS.some((user) => user.id === id);
export const canView = (ownerId, sharedUserIds, viewerId) => ownerId === viewerId || sharedUserIds.includes(viewerId);
export const canEdit = (ownerId, sharedUserIds, viewerId) => canView(ownerId, sharedUserIds, viewerId);
export function cleanHtml(input) {
  return sanitizeHtml(String(input ?? ''), {
    allowedTags: ['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 's'],
    allowedAttributes: {}, allowedSchemes: []
  });
}
export function validTitle(input) { return typeof input === 'string' && input.trim().length > 0 && input.trim().length <= 120; }
