jest.mock('axios');
const axios = require('axios');
const my = require('../../services/my/myClient');

const ENV_KEYS = [
  'MY_API_URL', 'MY_API_TOKEN', 'MY_HUB_UNIT_INSTANCE_ID', 'MY_ENGAGEMENT_PROJECT_ID',
  'MY_ENGAGEMENT_ACHIEVEMENT_ID', 'MY_SCHOOL_YEAR', 'MY_MAX_ENGAGEMENT_MARK',
];
const FAKE_TOKEN = 'fake-token-for-tests';

function setEnv() {
  process.env.MY_API_URL = 'https://my.test/api';
  process.env.MY_API_TOKEN = FAKE_TOKEN;
  process.env.MY_HUB_UNIT_INSTANCE_ID = '949';
  process.env.MY_ENGAGEMENT_PROJECT_ID = '5651';
  process.env.MY_ENGAGEMENT_ACHIEVEMENT_ID = '5833';
  process.env.MY_SCHOOL_YEAR = '2026';
  process.env.MY_MAX_ENGAGEMENT_MARK = '16';
}

describe('myClient', () => {
  const saved = {};
  beforeAll(() => ENV_KEYS.forEach((k) => { saved[k] = process.env[k]; }));
  afterAll(() => ENV_KEYS.forEach((k) => {
    if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k];
  }));
  beforeEach(() => {
    jest.resetAllMocks();
    setEnv();
  });

  const lastCall = () => axios.request.mock.calls[axios.request.mock.calls.length - 1][0];

  test('getConfig throws MyConfigError naming every missing variable', () => {
    delete process.env.MY_API_TOKEN;
    delete process.env.MY_SCHOOL_YEAR;
    let err;
    try { my.getConfig(); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(my.MyConfigError);
    expect(err.message).toContain('MY_API_TOKEN');
    expect(err.message).toContain('MY_SCHOOL_YEAR');
    expect(err.message).not.toContain('MY_HUB_UNIT_INSTANCE_ID');
  });

  test('getConfig reads values at call time and applies defaults', () => {
    delete process.env.MY_API_URL;
    const cfg = my.getConfig();
    expect(cfg.baseUrl).toBe('https://my.epitech.eu/api');
    expect(cfg.unitInstanceId).toBe(949);
    expect(cfg.engagementProjectId).toBe(5651);
    expect(cfg.achievementId).toBe(5833);
    expect(cfg.schoolYear).toBe(2026);
    expect(cfg.maxMark).toBe(16);
    process.env.MY_SCHOOL_YEAR = '2027';
    expect(my.getConfig().schoolYear).toBe(2027);
  });

  test('createActivity posts to /units/instances/949/activities with the fixed flags', async () => {
    axios.request.mockResolvedValue({ data: { id: 11 } });
    const res = await my.createActivity({
      name: 'n', description: 'd', startDate: 's', endDate: 'e', duration: 30,
    });
    expect(res).toEqual({ id: 11 });
    const call = lastCall();
    expect(call.method).toBe('POST');
    expect(call.url).toBe('https://my.test/api/units/instances/949/activities');
    expect(call.headers.Authorization).toBe(`Bearer ${FAKE_TOKEN}`);
    expect(call.data).toEqual({
      name: 'n', description: 'd', startDate: 's', endDate: 'e', duration: 30,
      slots: false, mandatory: false, forceRegistration: false, plannableSessions: 1,
    });
  });

  test('createEvent posts to /events', async () => {
    axios.request.mockResolvedValue({ data: { id: 22 } });
    const res = await my.createEvent({
      activityInstanceId: 11, title: 't', startDate: 's', endDate: 'e',
    });
    expect(res).toEqual({ id: 22 });
    const call = lastCall();
    expect(call.method).toBe('POST');
    expect(call.url).toBe('https://my.test/api/events');
    expect(call.data).toEqual({ activityInstanceId: 11, title: 't', startDate: 's', endDate: 'e' });
  });

  test('registerStudent posts the registration', async () => {
    axios.request.mockResolvedValue({ data: {} });
    await my.registerStudent(22, 'a.b@epitech.eu');
    const call = lastCall();
    expect(call.method).toBe('POST');
    expect(call.url).toBe('https://my.test/api/events/22/registrations/a.b%40epitech.eu');
  });

  test('registerStudent treats an already-registered 409 as success', async () => {
    axios.request.mockRejectedValue({ isAxiosError: true, response: { status: 409, data: { message: 'already registered' } } });
    await expect(my.registerStudent(22, 'login')).resolves.toBeUndefined();
  });

  test('setPresent posts the attendance record', async () => {
    axios.request.mockResolvedValue({ data: true });
    await my.setPresent(22, 'login');
    const call = lastCall();
    expect(call.method).toBe('POST');
    expect(call.url).toBe('https://my.test/api/events/22/attendance/set');
    expect(call.data).toEqual({ records: [{ login: 'login', status: 'present' }] });
  });

  test('findEngagementRegistrationId returns the registrationId of the engagement project', async () => {
    axios.request.mockResolvedValue({ data: [
      { projectInstanceId: 1, registrationId: 10 },
      { projectInstanceId: 5651, registrationId: 77 },
    ] });
    await expect(my.findEngagementRegistrationId('login')).resolves.toBe(77);
    const call = lastCall();
    expect(call.method).toBe('GET');
    expect(call.url).toBe('https://my.test/api/students/login/projects');
    expect(call.params).toEqual({ schoolYear: 2026 });
  });

  test('findEngagementRegistrationId returns null when no row matches the engagement project', async () => {
    axios.request.mockResolvedValue({ data: [{ projectInstanceId: 1, registrationId: 10 }] });
    await expect(my.findEngagementRegistrationId('login')).resolves.toBeNull();
  });

  test('openAssessmentSession returns assessmentSessionId', async () => {
    axios.request.mockResolvedValue({ data: { assessmentSessionId: 900 } });
    await expect(my.openAssessmentSession(77)).resolves.toBe(900);
    const call = lastCall();
    expect(call.method).toBe('POST');
    expect(call.url).toBe('https://my.test/api/evaluations/assessments/session/from-project-registration/77');
  });

  test('getAssessmentSession returns the raw body', async () => {
    const body = { assessments: [{ login: 'x' }] };
    axios.request.mockResolvedValue({ data: body });
    await expect(my.getAssessmentSession(900)).resolves.toBe(body);
    const call = lastCall();
    expect(call.method).toBe('GET');
    expect(call.url).toBe('https://my.test/api/evaluations/assessments/session/900');
  });

  test('saveAssessment sends achievementId from config and both comments', async () => {
    axios.request.mockResolvedValue({ data: {} });
    await my.saveAssessment(900, {
      login: 'login', mark: 8, individualComment: 'ind', groupComment: 'grp',
    });
    const call = lastCall();
    expect(call.method).toBe('PUT');
    expect(call.url).toBe('https://my.test/api/evaluations/assessments/session/900/assessments');
    expect(call.headers.Authorization).toBe(`Bearer ${FAKE_TOKEN}`);
    expect(call.data).toEqual({ assessments: [{
      login: 'login', achievementId: 5833, mark: 8, individualComment: 'ind', groupComment: 'grp',
    }] });
  });

  test('a 401 response becomes MyApiError with status 401 and the expired-key message', async () => {
    axios.request.mockRejectedValue({
      isAxiosError: true,
      message: `failed with ${FAKE_TOKEN}`,
      config: { headers: { Authorization: `Bearer ${FAKE_TOKEN}` } },
      response: { status: 401, data: {} },
    });
    let err;
    try { await my.createEvent({ activityInstanceId: 1, title: 't', startDate: 's', endDate: 'e' }); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(my.MyApiError);
    expect(err.status).toBe(401);
    expect(err.step).toBe('createEvent');
    expect(err.message).toContain('Clé API my invalide ou expirée');
    expect(err.message).not.toContain(FAKE_TOKEN);
    expect(err.message).not.toContain('Bearer');
  });

  test('a network error without response becomes MyApiError without leaking the token', async () => {
    axios.request.mockRejectedValue({ isAxiosError: true, message: `boom ${FAKE_TOKEN}` });
    let err;
    try { await my.setPresent(1, 'l'); } catch (e) { err = e; }
    expect(err).toBeInstanceOf(my.MyApiError);
    expect(err.status).toBe(0);
    expect(err.message).not.toContain(FAKE_TOKEN);
  });

  test('a missing config rejects with MyConfigError', async () => {
    delete process.env.MY_API_TOKEN;
    await expect(my.setPresent(1, 'l')).rejects.toBeInstanceOf(my.MyConfigError);
  });

  test('no function ever calls a URL ending with /confirm', async () => {
    axios.request.mockResolvedValue({ data: { id: 1, assessmentSessionId: 1 } });
    await my.createActivity({ name: 'n', description: 'd', startDate: 's', endDate: 'e', duration: 30 });
    await my.createEvent({ activityInstanceId: 1, title: 't', startDate: 's', endDate: 'e' });
    await my.registerStudent(1, 'l');
    await my.setPresent(1, 'l');
    await my.findEngagementRegistrationId('l').catch(() => {});
    await my.openAssessmentSession(1);
    await my.getAssessmentSession(1);
    await my.saveAssessment(1, { login: 'l', mark: 1, individualComment: '', groupComment: '' });
    expect(axios.request.mock.calls.length).toBeGreaterThan(0);
    axios.request.mock.calls.forEach(([c]) => expect(c.url).not.toMatch(/\/confirm\/?$/));
    expect(Object.keys(my).sort()).toEqual([
      'MyApiError', 'MyConfigError', 'createActivity', 'createEvent', 'findActivitiesByName',
      'findEngagementRegistrationId', 'getAssessmentSession', 'getConfig', 'listActivityEvents',
      'openAssessmentSession', 'registerStudent', 'saveAssessment', 'setPresent',
    ]);
  });

  describe('unusable creation responses', () => {
    test.each([
      ['an empty body', null],
      ['a body without id', {}],
      ['a non-numeric id', { id: 'abc' }],
    ])('createActivity with %s rejects with an explicit MyApiError', async (_label, data) => {
      axios.request.mockResolvedValue({ data });
      let err;
      try { await my.createActivity({ name: 'n', description: 'd', startDate: 's', endDate: 'e', duration: 30 }); } catch (e) { err = e; }
      expect(err).toBeInstanceOf(my.MyApiError);
      expect(err.step).toBe('createActivity');
      expect(err.message).toBe('Réponse my inattendue, vérifier sur my avant de relancer');
    });

    test.each([
      ['an empty body', ''],
      ['a body without id', { title: 't' }],
    ])('createEvent with %s rejects with an explicit MyApiError', async (_label, data) => {
      axios.request.mockResolvedValue({ data });
      let err;
      try { await my.createEvent({ activityInstanceId: 1, title: 't', startDate: 's', endDate: 'e' }); } catch (e) { err = e; }
      expect(err).toBeInstanceOf(my.MyApiError);
      expect(err.step).toBe('createEvent');
      expect(err.message).toBe('Réponse my inattendue, vérifier sur my avant de relancer');
    });
  });

  test('findActivitiesByName lists the unit instance activities with that exact name and reads their description', async () => {
    axios.request.mockImplementation(async ({ url }) => {
      if (url.endsWith('/units/instances/949/summary')) {
        return { data: { id: 949, activities: [
          { id: 1, name: 'Projet HUB - Alpha' },
          { id: 2, name: 'Projet HUB - Alpha bis' },
          { id: 3, name: 'Projet HUB - Alpha' },
        ] } };
      }
      if (url.endsWith('/units/instances/949/activities/1')) return { data: { id: 1, name: 'Projet HUB - Alpha', description: 'a : x/admin/projects/p1' } };
      if (url.endsWith('/units/instances/949/activities/3')) return { data: { id: 3, name: 'Projet HUB - Alpha', description: null } };
      throw new Error(`unexpected ${url}`);
    });
    await expect(my.findActivitiesByName('Projet HUB - Alpha')).resolves.toEqual([
      { id: 1, name: 'Projet HUB - Alpha', description: 'a : x/admin/projects/p1' },
      { id: 3, name: 'Projet HUB - Alpha', description: '' },
    ]);
    axios.request.mock.calls.forEach(([c]) => expect(c.method).toBe('GET'));
  });

  test('findActivitiesByName rejects an unexpected summary shape instead of reporting no activity', async () => {
    axios.request.mockResolvedValue({ data: { id: 949 } });
    await expect(my.findActivitiesByName('x')).rejects.toThrow('Réponse my inattendue, vérifier sur my avant de relancer');
  });

  test('listActivityEvents returns the events of an activity', async () => {
    axios.request.mockResolvedValue({ data: [
      { id: 5, title: 't', startDate: '2026-11-20T12:00:00.000Z', activityInstanceId: 11 },
    ] });
    await expect(my.listActivityEvents(11)).resolves.toEqual([
      { id: 5, title: 't', startDate: '2026-11-20T12:00:00.000Z' },
    ]);
    const call = lastCall();
    expect(call.method).toBe('GET');
    expect(call.url).toBe('https://my.test/api/events/by-activity/11');
  });

  test('listActivityEvents rejects a non-array response instead of reporting no event', async () => {
    axios.request.mockResolvedValue({ data: { message: 'x' } });
    await expect(my.listActivityEvents(11)).rejects.toBeInstanceOf(my.MyApiError);
  });

  describe('MY_API_URL scheme', () => {
    const savedNodeEnv = process.env.NODE_ENV;
    afterEach(() => { process.env.NODE_ENV = savedNodeEnv; });

    test('a plain http URL is rejected outside tests', () => {
      process.env.NODE_ENV = 'production';
      process.env.MY_API_URL = 'http://my.epitech.eu/api';
      expect(() => my.getConfig()).toThrow(my.MyConfigError);
      expect(() => my.getConfig()).toThrow(/MY_API_URL/);
    });

    test('http on localhost is accepted, https always', () => {
      process.env.NODE_ENV = 'production';
      process.env.MY_API_URL = 'http://localhost:4000/api';
      expect(my.getConfig().baseUrl).toBe('http://localhost:4000/api');
      process.env.MY_API_URL = 'https://my.epitech.eu/api';
      expect(my.getConfig().baseUrl).toBe('https://my.epitech.eu/api');
    });
  });
});
