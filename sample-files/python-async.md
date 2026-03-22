# Python Async Programming

## asyncio Basics
Event loop manages coroutines. Use async/await syntax. asyncio.run() starts the event loop.

## Concurrency vs Parallelism
Async is concurrent (single thread, interleaved I/O). Use multiprocessing for CPU-bound parallelism.

## Common Patterns
Gather multiple coroutines: asyncio.gather(*tasks). Rate limiting with semaphores. Async context managers.
