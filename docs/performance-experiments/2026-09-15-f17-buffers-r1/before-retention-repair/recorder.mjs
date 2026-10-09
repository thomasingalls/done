/**
 * The in-page half of the latency harness (TRD §12).
 *
 * Installed with `addInitScript`, so it is already running before any
 * application code — the only way to catch a milestone that happens during
 * boot. It watches what the user can see: a painted compose field, a mounted
 * editor, a day that has changed. Not React's lifecycle, because the budgets
 * are about the former, and because a measurement pinned to a lifecycle hook
 * quietly stops meaning the same thing the moment the hook moves.
 *
 * **Two conventions, and both matter for comparing runs later.**
 *
 * *Painted* means one frame plus a task. `requestAnimationFrame` runs before
 * the frame is committed, so the callback alone is too early; a task queued
 * from inside it runs after the browser has painted. This over-measures by
 * whatever a `setTimeout(0)` costs, and it over-measures identically every
 * time, which is what a baseline is for.
 *
 * *Started* means the browser's own event timestamp, never a wall clock on the
 * test side. Timing a click from Playwright would fold the CDP round trip into
 * every number and attribute it to the application.
 */

                           
                                                                                
                                    
                                                                               
                                    
                                                                             
                                            
                                                                       
                        
                                   
                                                                         
                                     
                                                      
                            
                                 
                                                                            
                                      
 

                
                    
                           
   
 

/**
 * Serialised into the page by Playwright, so it closes over nothing and
 * declares everything it uses.
 */
export const recorder = ()       => {
                   
                        
                     
   

  const watches = new Map               ();
  const keystrokes           = [];
  let capturing = false;
  let actionStart                = null;
  let actionPainted                = null;
  let armed = false;

  const afterPaint = ()                  =>
    new Promise((resolve) => {
      requestAnimationFrame(() => {
        setTimeout(() => resolve(performance.now()), 0);
      });
    });

  const check = (selector        , entry       )       => {
    if (entry.time !== null || entry.pending) return;
    if (!document.querySelector(selector)) return;
    entry.pending = true;
    void afterPaint().then((time) => {
      entry.pending = false;
      if (entry.time === null) entry.time = time;
    });
  };

  const observer = new MutationObserver(() => {
    for (const [selector, entry] of watches) check(selector, entry);
  });
  // `document` rather than `documentElement`: at this point the latter may not
  // exist yet, and the element the app renders into certainly does not.
  observer.observe(document, { subtree: true, childList: true, attributes: true });

  addEventListener(
    'keydown',
    (event) => {
      if (armed && event.isTrusted) {
        armed = false;
        actionStart = event.timeStamp;
        void afterPaint().then((time) => (actionPainted = time));
      }
      if (!capturing || !event.isTrusted) return;
      const started = event.timeStamp;
      void afterPaint().then((painted) => keystrokes.push(painted - started));
    },
    true,
  );

  addEventListener(
    'pointerdown',
    (event) => {
      if (!armed || !event.isTrusted) return;
      armed = false;
      actionStart = event.timeStamp;
      void afterPaint().then((time) => (actionPainted = time));
    },
    true,
  );

  window.latencyProbe = {
    watch: (selector) => {
      let entry = watches.get(selector);
      if (!entry) {
        entry = { time: null, pending: false };
        watches.set(selector, entry);
      }
      check(selector, entry);
    },
    clear: (selector) => {
      watches.delete(selector);
    },
    read: (selector) => watches.get(selector)?.time ?? null,
    armAction: () => {
      armed = true;
      actionStart = null;
      actionPainted = null;
    },
    actionStart: () => actionStart,
    actionPainted: () => actionPainted,
    armKeystrokes: () => {
      keystrokes.length = 0;
      capturing = true;
    },
    readKeystrokes: () => {
      capturing = false;
      return keystrokes.slice();
    },
    marks: () =>
      Object.fromEntries(
        performance.getEntriesByType('mark').map((entry) => [entry.name, entry.startTime]),
      ),
  };
};
