import { Router } from 'express';
import { createAjaxController } from '../controllers/AjaxController.js';

// AJAX endpoints of the PHP site. PHP read $_REQUEST, so each answers GET and POST.
export function ajaxRouter(controller = createAjaxController()) {
  const router = Router();
  const routes = {
    '/vbox': 'vbox',
    '/passage': 'passage',
    '/versionselect': 'versionSelect',
    '/settings': 'settings',
    '/save_prefs': 'savePrefs',
  };
  for (const [path, method] of Object.entries(routes)) {
    router.all(path, (req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'POST' && req.method !== 'HEAD') return next();
      return controller[method](req, res, next);
    });
  }
  return router;
}

export default ajaxRouter;
