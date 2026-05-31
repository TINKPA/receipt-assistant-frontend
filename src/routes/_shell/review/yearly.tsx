import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import YearlyReview from '../../../components/YearlyReview';

const yearlySearch = z.object({
  y: z.coerce.number().int().optional().catch(undefined), // 'YYYY'
});

export const Route = createFileRoute('/_shell/review/yearly')({
  validateSearch: yearlySearch,
  component: YearlyRoute,
});

function YearlyRoute() {
  const { y } = Route.useSearch();
  return <YearlyReview year={y} />;
}
