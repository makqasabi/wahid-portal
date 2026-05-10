import { useState, useEffect, useCallback, useRef } from 'react';
import { ChevronRight, ChevronLeft, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface TourStep {
  target: string; // data-tour attribute value
  title: string;
  titleAr: string;
  description: string;
  descriptionAr: string;
  position: 'right' | 'bottom' | 'left' | 'top';
  navigateTo?: string; // if set, navigate to this path before showing this step
}

const TOUR_STEPS: TourStep[] = [
  // ── Dashboard phase ──
  {
    target: 'logo',
    title: 'Welcome to Wahid',
    titleAr: 'مرحباً بك في واحد',
    description: 'Your unified operations portal for managing action items, tracking progress, and coordinating across teams.',
    descriptionAr: 'بوابتك الموحدة لإدارة بنود العمل ومتابعة التقدم والتنسيق بين الفرق.',
    position: 'right',
    navigateTo: '/dashboard',
  },
  {
    target: 'nav',
    title: 'Navigation',
    titleAr: 'التنقل',
    description: 'Use the sidebar to switch between Dashboard, Tickets, and Admin. It collapses for more screen space.',
    descriptionAr: 'استخدم الشريط الجانبي للتنقل بين لوحة المعلومات والتذاكر والإدارة. يمكن طيّه لمساحة أكبر.',
    position: 'right',
  },
  {
    target: 'main-content',
    title: 'Dashboard',
    titleAr: 'لوحة المعلومات',
    description: 'Your home base — KPI cards show open items, overdue count, and SLA rates. Charts below break down by entity, category, and team. Filter by organization using the tabs at top.',
    descriptionAr: 'قاعدتك الرئيسية — بطاقات المؤشرات تعرض البنود المفتوحة والمتأخرة ومعدلات الاتفاقية. الرسوم البيانية أدناه تفصّل حسب الجهة والفئة والفريق. صفّي حسب المنظمة باستخدام التبويبات.',
    position: 'bottom',
  },
  // ── Tickets phase — navigate to /tickets ──
  {
    target: 'nav',
    title: "Let's open Tickets",
    titleAr: 'لنفتح التذاكر',
    description: "Now we'll navigate to the Tickets page. This is where all action items are tracked — the core of the portal.",
    descriptionAr: 'الآن سننتقل إلى صفحة التذاكر. هنا يتم تتبع جميع بنود العمل — جوهر البوابة.',
    position: 'right',
    navigateTo: '/tickets',
  },
  {
    target: 'main-content',
    title: 'Tickets Table',
    titleAr: 'جدول التذاكر',
    description: 'Each row is an action item. Columns show: ticket ID, description, client, owner, due date, SLA badge (color-coded: green = on time, red = overdue), status, priority, and responsible entity. Click any row to see full details.',
    descriptionAr: 'كل صف يمثل بند عمل. الأعمدة تعرض: معرّف التذكرة، الوصف، العميل، المسؤول، تاريخ الاستحقاق، شارة الاتفاقية (بالألوان: أخضر = في الموعد، أحمر = متأخرة)، الحالة، الأولوية، والجهة المسؤولة. انقر على أي صف لرؤية التفاصيل.',
    position: 'bottom',
  },
  {
    target: 'ticket-quick-filters',
    title: 'Quick Filters',
    titleAr: 'الفلاتر السريعة',
    description: 'Quickly filter: "My Tickets" for items you own or submitted, "My Team" for your team\'s items, "Overdue" for delayed items, or "All" for everything. Click the filter icon below for advanced filtering by status, priority, client, category, owner, and date range.',
    descriptionAr: 'فلترة سريعة: "تذاكري" للبنود التي تملكها أو قدمتها، "فريقي" لبنود فريقك، "متأخرة" للبنود المتأخرة، أو "الكل" لعرض كل شيء. انقر أيقونة الفلتر أدناه للتصفية المتقدمة حسب الحالة والأولوية والعميل والفئة والمسؤول ونطاق التاريخ.',
    position: 'bottom',
  },
  {
    target: 'ticket-actions',
    title: "Let's create a ticket",
    titleAr: 'لننشئ تذكرة',
    description: 'Click "Create Ticket" to open the form, or "Export" to download all tickets as an Excel file. Let\'s go to the create page next.',
    descriptionAr: 'انقر على "إنشاء تذكرة" لفتح النموذج، أو "تصدير" لتحميل جميع التذاكر كملف إكسل. لننتقل إلى صفحة الإنشاء.',
    position: 'bottom',
  },
  // ── Create Ticket phase — navigate to /tickets/create ──
  {
    target: 'create-action-item',
    title: 'Describe the Action Item',
    titleAr: 'وصف بند العمل',
    description: 'This is where you write what needs to be done. Be specific — a clear description helps the assigned person understand the task and its context.',
    descriptionAr: 'هنا تكتب ما يجب القيام به. كن محدداً — الوصف الواضح يساعد الشخص المعيّن على فهم المهمة وسياقها.',
    position: 'bottom',
    navigateTo: '/tickets/create',
  },
  {
    target: 'create-assignments',
    title: 'Assignments & Classification',
    titleAr: 'التعيينات والتصنيف',
    description: 'Select the category (type of work), client (who this is for), owner (who will do it), owner team, and optionally a support person. Set the due date and priority level. The submitting team and owner entity are filled automatically.',
    descriptionAr: 'حدد الفئة (نوع العمل)، العميل (لمن هذا)، المسؤول (من سينفذ)، فريق المسؤول، واختيارياً شخص دعم. حدد تاريخ الاستحقاق ومستوى الأولوية. فريق التقديم وجهة المسؤول يُملآن تلقائياً.',
    position: 'top',
  },
  {
    target: 'create-submit',
    title: 'Submit',
    titleAr: 'الإرسال',
    description: 'Review everything, then click "Create Ticket" to submit. The ticket gets a unique ID and starts being tracked immediately. You can always edit it later from the ticket details page.',
    descriptionAr: 'راجع كل شيء، ثم انقر "إنشاء تذكرة" للإرسال. التذكرة تحصل على معرّف فريد ويبدأ تتبعها فوراً. يمكنك دائماً تعديلها لاحقاً من صفحة تفاصيل التذكرة.',
    position: 'top',
  },
  {
    target: 'main-content',
    title: 'Inside a Ticket',
    titleAr: 'داخل التذكرة',
    description: 'Once created, open any ticket to: change its status (Complete, On Hold, Delayed, Dependent), view the SLA countdown with color-coded badges, add comments for cross-team discussion, write internal notes visible only to your entity, attach files, and view the full audit history.',
    descriptionAr: 'بعد الإنشاء، افتح أي تذكرة لتتمكن من: تغيير حالتها (مكتملة، قيد الانتظار، متأخرة، تابعة)، عرض العد التنازلي للاتفاقية بشارات ملونة، إضافة تعليقات للنقاش بين الفرق، كتابة ملاحظات داخلية مرئية فقط لجهتك، إرفاق ملفات، وعرض سجل التدقيق الكامل.',
    position: 'bottom',
    navigateTo: '/tickets',
  },
  // ── Back to general ──
  {
    target: 'search',
    title: 'Quick Search',
    titleAr: 'البحث السريع',
    description: 'Search tickets instantly by keyword. Press Enter to jump to filtered results.',
    descriptionAr: 'ابحث في التذاكر فوراً بالكلمة المفتاحية. اضغط Enter للانتقال إلى النتائج.',
    position: 'bottom',
  },
  {
    target: 'notifications',
    title: 'Notifications',
    titleAr: 'الإشعارات',
    description: 'SLA warnings, ticket assignments, status changes, and new comments appear here. Stay on top of what needs attention.',
    descriptionAr: 'تحذيرات الاتفاقية، تعيينات التذاكر، تغييرات الحالة، والتعليقات الجديدة تظهر هنا.',
    position: 'bottom',
  },
  {
    target: 'user-section',
    title: 'Your Account',
    titleAr: 'حسابك',
    description: 'Change your password, enable Two-Factor Authentication for extra security, or sign out.',
    descriptionAr: 'غيّر كلمة المرور، فعّل المصادقة الثنائية لأمان إضافي، أو سجّل الخروج.',
    position: 'right',
  },
  {
    target: 'help',
    title: 'Replay Tour',
    titleAr: 'إعادة الجولة',
    description: 'Click this button anytime to replay this orientation tour.',
    descriptionAr: 'انقر على هذا الزر في أي وقت لإعادة جولة التعريف.',
    position: 'bottom',
  },
];

const TOUR_SEEN_KEY = 'wahid_tour_completed';

export function useGuidedTour() {
  const [isOpen, setIsOpen] = useState(() => {
    return !localStorage.getItem(TOUR_SEEN_KEY);
  });

  const openTour = useCallback(() => setIsOpen(true), []);
  const closeTour = useCallback(() => {
    setIsOpen(false);
    localStorage.setItem(TOUR_SEEN_KEY, 'true');
  }, []);

  return { isTourOpen: isOpen, openTour, closeTour };
}

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function GuidedTour({
  open,
  onClose,
  navigate,
}: {
  open: boolean;
  onClose: () => void;
  navigate?: (path: string) => void;
}) {
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const tooltipRef = useRef<HTMLDivElement>(null);
  const isArabic = document.documentElement.lang === 'ar';

  const current = TOUR_STEPS[step];
  const isFirst = step === 0;
  const isLast = step === TOUR_STEPS.length - 1;

  // Navigate to the target page if this step requires it
  useEffect(() => {
    if (!open || !current.navigateTo || !navigate) return;
    // Only navigate if we're not already on that page
    if (!window.location.pathname.startsWith(current.navigateTo)) {
      navigate(current.navigateTo);
    }
  }, [open, step, current.navigateTo, navigate]);

  // Find and measure target element
  useEffect(() => {
    if (!open) return;

    const findTarget = () => {
      const el = document.querySelector(`[data-tour="${current.target}"]`) as HTMLElement | null;
      if (!el) {
        setTargetRect(null);
        return;
      }

      const rect = el.getBoundingClientRect();
      const padding = 8;
      setTargetRect({
        top: rect.top - padding,
        left: rect.left - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      });

      // Scroll element into view if needed
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    };

    // Longer delay if navigating to a new page, short delay otherwise
    const delay = current.navigateTo ? 500 : 100;
    const timer = setTimeout(findTarget, delay);
    window.addEventListener('resize', findTarget);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', findTarget);
    };
  }, [open, step, current.target]);

  // Position tooltip — NEVER overlap the highlighted element
  useEffect(() => {
    if (!targetRect || !tooltipRef.current) return;

    const tw = tooltipRef.current.getBoundingClientRect().width;
    const th = tooltipRef.current.getBoundingClientRect().height;
    const gap = 16;
    const pad = 12;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isRtl = document.documentElement.dir === 'rtl';

    // Available space on each side of the target
    const spaceRight = vw - (targetRect.left + targetRect.width) - pad;
    const spaceLeft = targetRect.left - pad;
    const spaceBelow = vh - (targetRect.top + targetRect.height) - pad;
    const spaceAbove = targetRect.top - pad;

    // Try each side: only use it if the tooltip fits WITHOUT clamping into the target
    let top = 0;
    let left = 0;
    let placed = false;

    const tryOrder = [current.position, 'right', 'bottom', 'left', 'top'];
    const seen = new Set<string>();

    for (const pos of tryOrder) {
      if (seen.has(pos)) continue;
      seen.add(pos);

      if (pos === 'right' && spaceRight >= tw + gap) {
        top = targetRect.top + targetRect.height / 2 - th / 2;
        left = targetRect.left + targetRect.width + gap;
        placed = true;
        break;
      }
      if (pos === 'left' && spaceLeft >= tw + gap) {
        top = targetRect.top + targetRect.height / 2 - th / 2;
        left = targetRect.left - tw - gap;
        placed = true;
        break;
      }
      if (pos === 'bottom' && spaceBelow >= th + gap) {
        top = targetRect.top + targetRect.height + gap;
        left = targetRect.left + targetRect.width / 2 - tw / 2;
        placed = true;
        break;
      }
      if (pos === 'top' && spaceAbove >= th + gap) {
        top = targetRect.top - th - gap;
        left = targetRect.left + targetRect.width / 2 - tw / 2;
        placed = true;
        break;
      }
    }

    if (!placed) {
      // Target is too large for any side — pin to a corner that's visible
      // Use bottom-end corner of viewport, offset from edge
      top = vh - th - pad * 2;
      left = isRtl ? pad * 2 : vw - tw - pad * 2;
    }

    // Clamp to viewport edges (but since we checked space above, this won't cause overlap)
    top = Math.max(pad, Math.min(top, vh - th - pad));
    left = Math.max(pad, Math.min(left, vw - tw - pad));

    setTooltipStyle({ top, left });
  }, [targetRect, current.position, step]);

  if (!open) return null;

  const handleClose = () => {
    setStep(0);
    onClose();
  };

  const title = isArabic ? current.titleAr : current.title;
  const description = isArabic ? current.descriptionAr : current.description;

  return (
    <div className="fixed inset-0 z-[100]">
      {/* SVG overlay with spotlight cutout */}
      <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
        <defs>
          <mask id="tour-spotlight">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left}
                y={targetRect.top}
                width={targetRect.width}
                height={targetRect.height}
                rx="12"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          x="0"
          y="0"
          width="100%"
          height="100%"
          fill="rgba(0,0,0,0.55)"
          mask="url(#tour-spotlight)"
          style={{ pointerEvents: 'auto' }}
          onClick={handleClose}
        />
      </svg>

      {/* Spotlight ring glow — only for small/medium targets */}
      {targetRect && targetRect.width * targetRect.height < window.innerWidth * window.innerHeight * 0.4 && (
        <div
          className="absolute rounded-xl ring-2 ring-blue-400 ring-offset-2 shadow-[0_0_0_4px_rgba(59,130,246,0.2)] transition-all duration-500 ease-out"
          style={{
            top: targetRect.top,
            left: targetRect.left,
            width: targetRect.width,
            height: targetRect.height,
            pointerEvents: 'none',
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className="absolute z-10 w-80 rounded-xl bg-white shadow-2xl border border-gray-200 overflow-hidden transition-all duration-500 ease-out dark:bg-gray-800 dark:border-gray-700"
        style={tooltipStyle}
        dir={isArabic ? 'rtl' : 'ltr'}
      >
        {/* Progress bar */}
        <div className="h-1 bg-gray-100 dark:bg-gray-700">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
            style={{ width: `${((step + 1) / TOUR_STEPS.length) * 100}%` }}
          />
        </div>

        <div className="p-5">
          {/* Close */}
          <button
            onClick={handleClose}
            className="absolute top-3 end-3 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors dark:text-gray-500 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          >
            <X className="h-4 w-4" />
          </button>

          <h3 className="text-base font-semibold text-gray-900 mb-1.5 pe-6 dark:text-gray-100">
            {title}
          </h3>
          <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400">
            {description}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 bg-gray-50 dark:border-gray-700 dark:bg-gray-900">
          <span className="text-xs text-gray-400" dir="ltr">
            {step + 1} / {TOUR_STEPS.length}
          </span>

          <div className="flex items-center gap-2">
            {isFirst && (
              <button
                onClick={handleClose}
                className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-200 transition-colors"
              >
                {isArabic ? 'تخطي' : 'Skip'}
              </button>
            )}
            {!isFirst && (
              <button
                onClick={() => setStep(step - 1)}
                className="inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200 transition-colors"
              >
                {isArabic ? (
                  <>
                    <ChevronRight className="h-3.5 w-3.5" />
                    السابق
                  </>
                ) : (
                  <>
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Back
                  </>
                )}
              </button>
            )}

            {isLast ? (
              <button
                onClick={handleClose}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
              >
                {isArabic ? 'ابدأ' : 'Get Started'}
              </button>
            ) : (
              <button
                onClick={() => setStep(step + 1)}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
              >
                {isArabic ? (
                  <>
                    التالي
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
