import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import MonthlyReview from '../../../components/MonthlyReview';

const monthlySearch = z.object({
  m: z.string().regex(/^\d{4}-\d{2}$/).optional().catch(undefined), // 'YYYY-MM'
});

export const Route = createFileRoute('/_shell/review/monthly')({
  validateSearch: monthlySearch,
  component: MonthlyRoute,
});

function MonthlyRoute() {
  const { m } = Route.useSearch();
  return <MonthlyReview month={m} />;
}
