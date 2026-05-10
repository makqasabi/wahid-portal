import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Lock, StickyNote } from 'lucide-react';
import { commentsApi } from '@/api/client';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import type { Comment } from '@/types';

interface InternalNotesProps {
  ticketId: string;
  notes: Comment[];
  currentEntityId: string;
  entityName?: string;
  onNoteAdded?: () => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function InternalNotes({
  ticketId,
  notes,
  currentEntityId,
  entityName,
  onNoteAdded,
}: InternalNotesProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localNotes, setLocalNotes] = useState<Comment[]>(notes);

  const handleSubmit = async () => {
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      const created = await commentsApi.create(ticketId, body.trim(), true);
      setLocalNotes((prev) => [...prev, created]);
      setBody('');
      onNoteAdded?.();
    } catch {
      // error handled by interceptor
    } finally {
      setSubmitting(false);
    }
  };

  const displayed = localNotes.length > notes.length ? localNotes : notes;
  const displayEntityName = entityName ?? currentEntityId;

  return (
    <div className="space-y-4">
      {/* Warning banner */}
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        <Lock className="h-4 w-4 flex-shrink-0" />
        <span>{t('onlyVisibleTo', { org: displayEntityName })}</span>
      </div>

      {displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <StickyNote className="mb-2 h-8 w-8" />
          <p className="text-sm">{t('noInternalNotesYet')}</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {displayed.map((note) => {
            const authorName = note.author?.fullName ?? t('comments.unknown');
            return (
              <li
                key={note.id}
                className="flex gap-3 rounded-lg border border-amber-100 bg-amber-50/50 p-3"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-amber-500 text-xs font-semibold text-white">
                  {getInitials(authorName)}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-900">
                      {authorName}
                    </span>
                    <Badge variant="warning">{t('comments.internal')}</Badge>
                    <span className="text-xs text-gray-400">
                      {formatDistanceToNow(new Date(note.createdAt), {
                        addSuffix: true,
                        ...(isAr && { locale: ar }),
                      })}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
                    {note.body}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Add note form */}
      <div className="border-t border-amber-200 pt-4">
        <textarea
          className="w-full rounded-lg border border-amber-300 bg-amber-50/30 px-3 py-2 text-sm placeholder-gray-400 focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          rows={3}
          placeholder={t('writeInternalNote')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="mt-2 flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={!body.trim() || submitting}
            className="bg-amber-600 hover:bg-amber-700"
          >
            {submitting ? t('comments.adding') : t('addNote')}
          </Button>
        </div>
      </div>
    </div>
  );
}
