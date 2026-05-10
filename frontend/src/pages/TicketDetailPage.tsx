import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import {
  ArrowLeft,
  Calendar,
  Edit2,
  Download,
  Send,
  Upload,
  Trash2,
  CheckCircle,
  PauseCircle,
  PlayCircle,
  RotateCcw,
  Link2,
  Clock,
  FileText,
  MessageSquare,
  Lock,
  History,
} from 'lucide-react';
import { ticketsApi, commentsApi, exportApi, attachmentsApi } from '@/api/client';
import { useAuth } from '@/hooks/useAuth';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Spinner } from '@/components/ui/Spinner';
import { Modal } from '@/components/ui/Modal';
import { StatusBadge } from '@/components/tickets/StatusBadge';
import { PriorityBadge } from '@/components/tickets/PriorityBadge';
import { SlaBadge } from '@/components/tickets/SlaBadge';
import { formatDate, formatDateTime, isMeenaEntity, localName } from '@/lib/utils';
import type { Ticket, Comment, AuditLog, Progress } from '@/types';

type ActivityTab = 'discussion' | 'notes' | 'attachments' | 'history';

interface StatusTransition {
  labelKey: string;
  newStatus: Progress;
  icon: React.ReactNode;
  variant: 'primary' | 'secondary' | 'danger' | 'outline';
}

function getTransitions(
  progress: Progress,
  canChangeStatus: boolean,
  canReopen: boolean,
): StatusTransition[] {
  if (!canChangeStatus && !canReopen) return [];

  const transitions: StatusTransition[] = [];

  switch (progress) {
    case 'IN_PROGRESS':
      if (canChangeStatus) {
        transitions.push(
          { labelKey: 'markComplete', newStatus: 'COMPLETED', icon: <CheckCircle className="h-4 w-4" />, variant: 'primary' },
          { labelKey: 'putOnHold', newStatus: 'ON_HOLD', icon: <PauseCircle className="h-4 w-4" />, variant: 'outline' },
          { labelKey: 'markDependent', newStatus: 'DEPENDENT', icon: <Link2 className="h-4 w-4" />, variant: 'outline' },
        );
      }
      break;
    case 'DELAYED':
      if (canChangeStatus) {
        transitions.push(
          { labelKey: 'markComplete', newStatus: 'COMPLETED', icon: <CheckCircle className="h-4 w-4" />, variant: 'primary' },
          { labelKey: 'putOnHold', newStatus: 'ON_HOLD', icon: <PauseCircle className="h-4 w-4" />, variant: 'outline' },
          { labelKey: 'backToInProgress', newStatus: 'IN_PROGRESS', icon: <PlayCircle className="h-4 w-4" />, variant: 'secondary' },
        );
      }
      break;
    case 'ON_HOLD':
      if (canChangeStatus) {
        transitions.push(
          { labelKey: 'resumeInProgress', newStatus: 'IN_PROGRESS', icon: <PlayCircle className="h-4 w-4" />, variant: 'primary' },
        );
      }
      break;
    case 'DEPENDENT':
      if (canChangeStatus) {
        transitions.push(
          { labelKey: 'resumeInProgress', newStatus: 'IN_PROGRESS', icon: <PlayCircle className="h-4 w-4" />, variant: 'primary' },
        );
      }
      break;
    case 'COMPLETED':
      if (canReopen) {
        transitions.push(
          { labelKey: 'reopen', newStatus: 'IN_PROGRESS', icon: <RotateCcw className="h-4 w-4" />, variant: 'danger' },
        );
      }
      break;
  }

  return transitions;
}

export default function TicketDetailPage() {
  const { t, i18n } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isEntityAdmin, isSuperAdmin } = useAuth();

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [comments, setComments] = useState<Comment[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [activeTab, setActiveTab] = useState<ActivityTab>('discussion');
  const [commentBody, setCommentBody] = useState('');
  const [sendingComment, setSendingComment] = useState(false);

  const [confirmModal, setConfirmModal] = useState(false);
  const [pendingTransition, setPendingTransition] = useState<StatusTransition | null>(null);
  const [transitioning, setTransitioning] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fetchTicket = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const data = await ticketsApi.getById(id);
      setTicket(data);
      if (data.auditLogs) setAuditLogs(data.auditLogs);
      setError('');
    } catch {
      setError(t('failedLoadTicket'));
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchComments = useCallback(async () => {
    if (!id) return;
    try {
      const data = await commentsApi.listByTicket(id);
      setComments(data);
    } catch {
      // non-critical
    }
  }, [id]);

  useEffect(() => {
    fetchTicket();
    fetchComments();
  }, [fetchTicket, fetchComments]);

  const handleAddComment = async (isInternal: boolean) => {
    if (!id || !commentBody.trim()) return;
    setSendingComment(true);
    try {
      await commentsApi.create(id, commentBody.trim(), isInternal);
      setCommentBody('');
      await fetchComments();
      toast.success(t('commentAdded'));
    } catch {
      toast.error(t('failedAddComment'));
    } finally {
      setSendingComment(false);
    }
  };

  const handleStatusChange = async () => {
    if (!id || !pendingTransition) return;
    setTransitioning(true);
    try {
      await ticketsApi.update(id, { progress: pendingTransition.newStatus });
      toast.success(t('statusChangedTo', { status: t(pendingTransition.labelKey) }));
      await fetchTicket();
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? t('failedUpdateStatus');
      toast.error(msg);
    } finally {
      setTransitioning(false);
      setConfirmModal(false);
      setPendingTransition(null);
    }
  };

  const handleExportPdf = async () => {
    if (!id) return;
    try {
      const blob = await exportApi.ticketPdf(id);
      const url = window.URL.createObjectURL(blob as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${ticket?.displayId ?? 'ticket'}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error(t('failedExportPdf'));
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    if (file.size > 10 * 1024 * 1024) {
      toast.error(t('fileSizeLimit'));
      return;
    }
    setUploading(true);
    try {
      await attachmentsApi.upload(id, file);
      toast.success(t('fileUploaded'));
      await fetchTicket();
    } catch {
      toast.error(t('failedUploadFile'));
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDownload = async (attId: string, fileName: string) => {
    try {
      const blob = await attachmentsApi.download(attId);
      const url = window.URL.createObjectURL(blob as Blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error(t('failedDownloadFile'));
    }
  };

  const handleDeleteAttachment = async (attId: string) => {
    try {
      await attachmentsApi.remove(attId);
      toast.success(t('attachmentDeleted'));
      await fetchTicket();
    } catch {
      toast.error(t('failedDeleteAttachment'));
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner size="lg" />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-4">
        <p className="text-gray-500 dark:text-gray-400">{error || t('ticketNotFound')}</p>
        <Button variant="outline" onClick={() => navigate('/tickets')}>
          {t('backToTickets')}
        </Button>
      </div>
    );
  }

  const isOwner = user?.id === ticket.ownerId;
  const isSubmitter = user?.id === ticket.submittedById;
  const isTeamLead = user?.id && ticket.ownerTeamId === user?.teamId && user?.role === 'TEAM_LEAD';
  const canChangeStatus = isOwner || isEntityAdmin || isSuperAdmin || !!isTeamLead;
  const canReopen = isSubmitter || isEntityAdmin || isSuperAdmin;
  const canEditTicket = isOwner || isSubmitter || isEntityAdmin || isSuperAdmin;

  const transitions = getTransitions(ticket.progress, canChangeStatus, canReopen);
  const discussionComments = comments.filter((c) => !c.isInternal);
  const internalNotes = comments.filter((c) => c.isInternal);

  const tabs: { key: ActivityTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'discussion', label: t('discussion'), icon: <MessageSquare className="h-4 w-4" />, count: discussionComments.length },
    { key: 'notes', label: t('internalNotes'), icon: <Lock className="h-4 w-4" />, count: internalNotes.length },
    { key: 'attachments', label: t('attachments'), icon: <FileText className="h-4 w-4" />, count: ticket.attachments?.length ?? 0 },
    { key: 'history', label: t('history'), icon: <History className="h-4 w-4" />, count: auditLogs.length },
  ];

  return (
    <div className="space-y-4">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/tickets')}>
          <ArrowLeft className="h-4 w-4 me-1" />
          {t('back')}
        </Button>

        <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">{ticket.displayId}</h1>

        <StatusBadge status={ticket.progress} />
        <PriorityBadge priority={ticket.priority} />
        <SlaBadge
          slaVarianceDays={ticket.slaVarianceDays}
          dueDate={ticket.dueDate}
          progress={ticket.progress}
        />

        <div className="flex-1" />

        <Button variant="outline" size="sm" onClick={handleExportPdf}>
          <Download className="h-4 w-4 me-1" />
          {t('pdf')}
        </Button>

        {canEditTicket && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/tickets/${ticket.id}/edit`)}
          >
            <Edit2 className="h-4 w-4 me-1" />
            {t('edit')}
          </Button>
        )}

        {transitions.map((tr) => (
          <Button
            key={tr.newStatus}
            variant={tr.variant}
            size="sm"
            icon={tr.icon}
            onClick={() => {
              setPendingTransition(tr);
              setConfirmModal(true);
            }}
          >
            {t(tr.labelKey)}
          </Button>
        ))}
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Left column: Ticket Details */}
        <div className="lg:col-span-1 space-y-4">
          <Card title={t('details')}>
            <dl className="space-y-3 text-sm">
              <DetailRow label={t('actionItem')}>
                <p className="text-gray-900 whitespace-pre-wrap">{ticket.actionItem}</p>
              </DetailRow>
              <DetailRow label={t('category')}>
                {localName(ticket.category, i18n.language)}
              </DetailRow>
              <DetailRow label={t('client')}>
                {localName(ticket.client, i18n.language)}
              </DetailRow>
              <DetailRow label={t('submittedBy')}>
                {ticket.submittedBy?.fullName ?? '-'}
              </DetailRow>
              <DetailRow label={t('submittingTeam')}>
                {localName(ticket.submittingTeam, i18n.language)}
              </DetailRow>
              <DetailRow label={t('owner')}>
                {ticket.owner?.fullName ?? '-'}
              </DetailRow>
              <DetailRow label={t('ownerTeam')}>
                {localName(ticket.ownerTeam, i18n.language)}
              </DetailRow>
              <DetailRow label={t('ownerEntity')}>
                {ticket.ownerEntity ? (
                  <Badge
                    variant={
                      isMeenaEntity(ticket.ownerEntity.name)
                        ? 'warning'
                        : 'info'
                    }
                  >
                    {localName(ticket.ownerEntity, i18n.language)}
                  </Badge>
                ) : (
                  '-'
                )}
              </DetailRow>
              {ticket.support && (
                <DetailRow label={t('support')}>
                  {ticket.support.fullName}
                </DetailRow>
              )}
              <DetailRow label={t('dueDate')}>
                <span className="inline-flex items-center gap-1">
                  <Calendar className="h-3.5 w-3.5 text-gray-400" />
                  {ticket.dueDate ? formatDate(ticket.dueDate) : '-'}
                </span>
              </DetailRow>
              {ticket.closureDate && (
                <DetailRow label={t('closureDate')}>
                  {formatDate(ticket.closureDate)}
                </DetailRow>
              )}
              <DetailRow label={t('priority')}>
                <PriorityBadge priority={ticket.priority} />
              </DetailRow>
              <DetailRow label={t('created')}>
                {formatDateTime(ticket.createdAt)}
              </DetailRow>
              <DetailRow label={t('updated')}>
                {formatDateTime(ticket.updatedAt)}
              </DetailRow>
            </dl>
          </Card>
        </div>

        {/* Right column: Activity */}
        <div className="lg:col-span-2">
          {/* Tabs */}
          <div className="mb-4 flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 overflow-x-auto dark:border-gray-700 dark:bg-gray-800">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100'
                    : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
                }`}
              >
                {tab.icon}
                {tab.label}
                {tab.count !== undefined && tab.count > 0 && (
                  <span className="ms-1 rounded-full bg-gray-200 px-1.5 py-0.5 text-xs text-gray-600 dark:bg-gray-600 dark:text-gray-300">
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Discussion Tab */}
          {activeTab === 'discussion' && (
            <Card>
              <div className="space-y-4 max-h-[500px] overflow-y-auto mb-4">
                {discussionComments.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">
                    {t('noCommentsYet')}
                  </p>
                ) : (
                  discussionComments.map((c) => (
                    <CommentBubble key={c.id} comment={c} />
                  ))
                )}
              </div>
              <div className="border-t pt-4 dark:border-gray-700">
                <textarea
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder={t('writeComment')}
                  rows={3}
                  className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-twn-500 focus:outline-none focus:ring-2 focus:ring-twn-200 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 dark:placeholder-gray-500"
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    icon={<Send className="h-4 w-4" />}
                    loading={sendingComment}
                    disabled={!commentBody.trim()}
                    onClick={() => handleAddComment(false)}
                  >
                    {t('send')}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Internal Notes Tab */}
          {activeTab === 'notes' && (
            <Card>
              <div className="mb-4 rounded-lg border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-800">
                <Lock className="me-1 inline h-3.5 w-3.5" />
                {t('onlyVisibleTo', { org: localName(user?.entity, i18n.language) || 'your organization' })}
              </div>
              <div className="space-y-4 max-h-[500px] overflow-y-auto mb-4">
                {internalNotes.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-8">
                    {t('noInternalNotesYet')}
                  </p>
                ) : (
                  internalNotes.map((c) => (
                    <CommentBubble key={c.id} comment={c} isInternal />
                  ))
                )}
              </div>
              <div className="border-t pt-4 dark:border-gray-700">
                <textarea
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  placeholder={t('writeInternalNote')}
                  rows={3}
                  className="block w-full rounded-lg border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-yellow-500 focus:outline-none focus:ring-2 focus:ring-yellow-200"
                />
                <div className="mt-2 flex justify-end">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Send className="h-4 w-4" />}
                    loading={sendingComment}
                    disabled={!commentBody.trim()}
                    onClick={() => handleAddComment(true)}
                  >
                    {t('addNote')}
                  </Button>
                </div>
              </div>
            </Card>
          )}

          {/* Attachments Tab */}
          {activeTab === 'attachments' && (
            <Card>
              {ticket.attachments && ticket.attachments.length > 0 ? (
                <div className="space-y-2 mb-4">
                  {ticket.attachments.map((att) => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 dark:border-gray-700"
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-gray-400" />
                        <div>
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {att.fileName}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {att.fileSize >= 1024 * 1024
                              ? `${(att.fileSize / (1024 * 1024)).toFixed(1)} MB`
                              : `${(att.fileSize / 1024).toFixed(1)} KB`}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDownload(att.id, att.fileName)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                        {canEditTicket && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteAttachment(att.id)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500 text-center py-6 mb-4">
                  {t('noAttachmentsYet')}
                </p>
              )}

              <label className="flex cursor-pointer items-center justify-center rounded-lg border-2 border-dashed border-gray-300 px-6 py-8 transition-colors hover:border-twn-400 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700">
                <div className="text-center">
                  <Upload className="mx-auto h-8 w-8 text-gray-400" />
                  <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
                    {uploading ? t('uploading') : t('clickToUpload')}
                  </p>
                  <p className="text-xs text-gray-400 mt-1 dark:text-gray-500">
                    {t('maxFileSize')}
                  </p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  onChange={handleFileUpload}
                  disabled={uploading}
                />
              </label>
            </Card>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <Card>
              {auditLogs.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  {t('noHistoryEntries')}
                </p>
              ) : (
                <div className="relative">
                  <div className="absolute start-4 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />
                  <div className="space-y-6 ps-10">
                    {auditLogs.map((log) => (
                      <div key={log.id} className="relative">
                        <div className="absolute -start-[26px] top-1 h-3 w-3 rounded-full border-2 border-gray-300 bg-white dark:border-gray-600 dark:bg-gray-800" />
                        <div>
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <Clock className="h-3 w-3" />
                            {formatDateTime(log.createdAt)}
                            <span className="font-medium text-gray-700 dark:text-gray-300">
                              {log.user?.fullName ?? t('comments.system')}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-gray-900 dark:text-gray-100">
                            {log.action}
                          </p>
                          {log.fieldName && (
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-medium text-gray-600">
                                {log.fieldName}:
                              </span>
                              {log.oldValue && (
                                <span className="rounded bg-red-50 px-1.5 py-0.5 text-red-600 line-through">
                                  {log.oldValue}
                                </span>
                              )}
                              {log.oldValue && log.newValue && (
                                <span className="text-gray-400">&rarr;</span>
                              )}
                              {log.newValue && (
                                <span className="rounded bg-green-50 px-1.5 py-0.5 text-green-700">
                                  {log.newValue}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>

      {/* Status Change Confirmation Modal */}
      <Modal
        open={confirmModal}
        onOpenChange={setConfirmModal}
        title={t('confirmStatusChange')}
        description={t('confirmStatusChangeDesc', { status: pendingTransition ? t(pendingTransition.labelKey) : '' })}
      >
        <div className="flex justify-end gap-3 mt-4">
          <Button variant="outline" onClick={() => setConfirmModal(false)}>
            {t('cancel')}
          </Button>
          <Button loading={transitioning} onClick={handleStatusChange}>
            {t('confirm')}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

/* ---------- Sub-components ---------- */

function DetailRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
        {label}
      </dt>
      <dd className="text-gray-900 dark:text-gray-100">{children}</dd>
    </div>
  );
}

function CommentBubble({
  comment,
  isInternal,
}: {
  comment: Comment;
  isInternal?: boolean;
}) {
  const { t, i18n } = useTranslation();
  return (
    <div
      className={`rounded-lg border px-4 py-3 ${
        isInternal
          ? 'border-yellow-200 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-900/20'
          : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900'
      }`}
    >
      <div className="mb-1 flex items-center gap-2">
        <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {comment.author?.fullName ?? t('comments.unknown')}
        </span>
        {comment.author?.entity && (
          <Badge
            variant={
              isMeenaEntity(comment.author.entity.name)
                ? 'warning'
                : 'info'
            }
          >
            {localName(comment.author.entity, i18n.language)}
          </Badge>
        )}
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {formatDateTime(comment.createdAt)}
        </span>
      </div>
      <p className="text-sm text-gray-700 whitespace-pre-wrap dark:text-gray-300">
        {comment.body}
      </p>
    </div>
  );
}
