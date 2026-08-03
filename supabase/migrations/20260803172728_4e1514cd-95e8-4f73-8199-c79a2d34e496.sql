DELETE FROM public.benchmarks WHERE task_class IN ('generation','code','classification');
DELETE FROM public.benchmark_margins WHERE task_class IN ('generation','code','classification');