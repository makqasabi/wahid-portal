import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { MessageSquare } from 'lucide-react';
import { commentsApi } from '@/api/client';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { isMeenaEntity, localName } from '@/lib/utils';
import type { Comment } from '@/types';

interface DiscussionThreadProps {
  ticketId: string;
  comments: Comment[];
  onCommentAdded?: () => void;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export function DiscussionThread({
  ticketId,
  comments,
  onCommentAdded,
}: DiscussionThreadProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language === 'ar';
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [localComments, setLocalComments] = useState<Comment[]>(comments);

  const handleSubmit = async () => {
    if (!body.trim()) return;
    setSubmitting(true);
    try {
      const created = await commentsApi.create(ticketId, body.trim(), false);
      setLocalComments((prev) => [...prev, created]);
      setBody('');
      onCommentAdded?.();
    } catch {
      // error handled by interceptor
    } finally {
      setSubmitting(false);
    }
  };

  const displayed = localComments.length > comments.length ? localComments : comments;

  return (
    <div className="space-y-4">
      {displayed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <MessageSquare className="mb-2 h-8 w-8" />
          <p className="text-sm">{t('noCommentsYet')}</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {displayed
            .filter((c) => !c.isInternal)
            .map((comment) => {
              const entityObj = comment.author?.entity ?? comment.authorEntity ?? null;
              const entityName = entityObj?.name ?? '';
              const meena = isMeenaEntity(entityName);
              const authorName = comment.author?.fullName ?? t('comments.unknown');
              return (
                <li key={comment.id} className="flex gap-3">
                  <div
                    className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white ${meena ? 'bg-emerald-600' : 'bg-blue-600'}`}
                  >
                    {getInitials(authorName)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-900">
                        {authorName}
                      </span>
                      {entityName && (
                        <Badge variant={meena ? 'warning' : 'info'}>{localName(entityObj, i18n.language)}</Badge>
                      )}
                      <span className="text-xs text-gray-400">
                        {formatDistanceToNow(new Date(comment.createdAt), {
                          addSuffix: true,
                          ...(isAr && { locale: ar }),
                        })}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-gray-700 whitespace-pre-wrap">
                      {comment.body}
                    </p>
                  </div>
                </li>
              );
            })}
        </ul>
      )}

      {/* Add comment form */}
      <div className="border-t border-gray-200 pt-4">
        <textarea
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm placeholder-gray-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          rows={3}
          placeholder={t('writeComment')}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="mt-2 flex justify-end">
          <Button
            onClick={handleSubmit}
            disabled={!body.trim() || submitting}
          >
            {submitting ? t('comments.posting') : t('comments.postComment')}
          </Button>
        </div>
      </div>
    </div>
  );
}
