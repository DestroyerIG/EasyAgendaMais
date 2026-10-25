import { catchAllProxy } from '@/lib/server/catchAllProxy';

export const { GET, POST, PUT, DELETE } = catchAllProxy('bancada');
