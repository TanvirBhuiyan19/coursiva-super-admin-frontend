// Display helpers local to billing screens.
import { money } from '@/lib/format';
import { t } from './i18n';

/** +$1,234 · −$56 */
export const signedMoney = (n: number) => (n >= 0 ? '+' : '−') + money(Math.abs(n));

/** "5 staff seats" · "Unlimited staff seats" (0 = unlimited). */
export const staffSeatsText = (n: number) => (n === 0 ? t('planCards.unlimitedStaffSeats') : t('planCards.staffSeats', { count: n }));

/** "500 students" · "Unlimited students" (0 = unlimited). */
export const studentsText = (n: number) => (n === 0 ? t('planCards.unlimitedStudents') : t('planCards.students', { count: n }));

/** "50 GB storage" · "2 TB storage" · "Unlimited storage". */
export const storageText = (gb: number) =>
  gb === 0 ? t('planCards.unlimitedStorage') : gb >= 1000 ? t('planCards.storageTb', { tb: gb / 1000 }) : t('planCards.storageGb', { gb });
