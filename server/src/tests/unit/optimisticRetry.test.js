const { withOptimisticRetry } = require('../../utils/optimisticRetry');

describe('withOptimisticRetry', () => {
  it('returns the apply result on first success without retrying', async () => {
    const reload = jest.fn().mockResolvedValue({ id: 1 });
    const apply = jest.fn().mockResolvedValue('ok');

    const result = await withOptimisticRetry(reload, apply);

    expect(result).toBe('ok');
    expect(reload).toHaveBeenCalledTimes(1);
    expect(apply).toHaveBeenCalledTimes(1);
  });

  it('reloads and retries on VersionError, then succeeds', async () => {
    const docs = [{ id: 'stale' }, { id: 'fresh' }];
    const reload = jest.fn().mockImplementation(() => Promise.resolve(docs.shift()));
    const versionError = Object.assign(new Error('conflict'), { name: 'VersionError' });
    const apply = jest
      .fn()
      .mockImplementationOnce(() => Promise.reject(versionError))
      .mockImplementationOnce((doc) => Promise.resolve(doc.id));

    const result = await withOptimisticRetry(reload, apply);

    expect(result).toBe('fresh');
    expect(reload).toHaveBeenCalledTimes(2);
    expect(apply).toHaveBeenCalledTimes(2);
  });

  it('propagates a non-VersionError immediately without retrying', async () => {
    const reload = jest.fn().mockResolvedValue({});
    const otherError = new Error('boom');
    const apply = jest.fn().mockRejectedValue(otherError);

    await expect(withOptimisticRetry(reload, apply)).rejects.toBe(otherError);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('gives up and throws after exhausting all attempts on repeated VersionError', async () => {
    const reload = jest.fn().mockResolvedValue({});
    const versionError = Object.assign(new Error('conflict'), { name: 'VersionError' });
    const apply = jest.fn().mockRejectedValue(versionError);

    await expect(withOptimisticRetry(reload, apply)).rejects.toBe(versionError);
    expect(reload).toHaveBeenCalledTimes(5);
    expect(apply).toHaveBeenCalledTimes(5);
  });
});
