const { createIntervalTask } = require('../../utils/intervalTask');

describe('createIntervalTask', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('runs the task repeatedly at the given interval', async () => {
    const task = jest.fn().mockResolvedValue(undefined);
    const { start, stop } = createIntervalTask('[test]', task, 1000);

    start();
    await jest.advanceTimersByTimeAsync(3000);
    stop();

    expect(task).toHaveBeenCalledTimes(3);
  });

  it('does not start a second interval if already running', async () => {
    const task = jest.fn().mockResolvedValue(undefined);
    const { start, stop } = createIntervalTask('[test]', task, 1000);

    start();
    start();
    await jest.advanceTimersByTimeAsync(1000);
    stop();

    expect(task).toHaveBeenCalledTimes(1);
  });

  it('stops calling the task after stop()', async () => {
    const task = jest.fn().mockResolvedValue(undefined);
    const { start, stop } = createIntervalTask('[test]', task, 1000);

    start();
    await jest.advanceTimersByTimeAsync(1000);
    stop();
    await jest.advanceTimersByTimeAsync(3000);

    expect(task).toHaveBeenCalledTimes(1);
  });

  it('logs a task error without stopping the interval', async () => {
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const task = jest.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue(undefined);
    const { start, stop } = createIntervalTask('[test]', task, 1000);

    start();
    await jest.advanceTimersByTimeAsync(2000);
    stop();

    expect(task).toHaveBeenCalledTimes(2);
    expect(errorSpy).toHaveBeenCalledWith('[test] erreur:', 'boom');
    errorSpy.mockRestore();
  });

  it('start() accepts an interval override', async () => {
    const task = jest.fn().mockResolvedValue(undefined);
    const { start, stop } = createIntervalTask('[test]', task, 1000);

    start(500);
    await jest.advanceTimersByTimeAsync(1000);
    stop();

    expect(task).toHaveBeenCalledTimes(2);
  });
});
