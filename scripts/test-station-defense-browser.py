import asyncio, json, os
from pathlib import Path
from playwright.async_api import async_playwright
BASE=os.environ.get('GAME_TEST_URL','http://127.0.0.1:8765/')
ROOT=Path(__file__).resolve().parents[1]
async def prepare(context,instrument=False,fullscreen_fallback=False):
 await context.route('https://cdn.tailwindcss.com/**',lambda r:r.fulfill(path='/tmp/sd-tailwind.js',content_type='application/javascript'))
 await context.route('https://fonts.googleapis.com/**',lambda r:r.fulfill(body='',content_type='text/css'))
 await context.route('https://**.workers.dev/**',lambda r:r.fulfill(body=json.dumps({'ready':True,'debates':[]}),content_type='application/json'))
 if instrument:
  code=(ROOT/'assets/game/station-defense/main.js').read_text().replace('game=new Game(settings);','game=new Game(settings);window.__game=game;')
  await context.route('**/station-defense/main.js',lambda r:r.fulfill(body=code,content_type='application/javascript'))
 if fullscreen_fallback:
  await context.add_init_script("Element.prototype.requestFullscreen=function(){return Promise.reject(new Error('test fallback'));}")
async def enter(page):
 await page.goto(BASE,wait_until='networkidle')
 assert await page.locator('.home-board-card').count()==8
 await page.locator('.home-board-card').filter(has_text='게임하기').click()
 await page.locator('#sd-start').wait_for(state='visible')
 await page.wait_for_timeout(700)
async def desktop(browser):
 ctx=await browser.new_context(viewport={'width':1440,'height':900},device_scale_factor=2)
 await prepare(ctx,True)
 page=await ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 await enter(page)
 await page.screenshot(path='/tmp/sd-intro.png',full_page=True)
 await page.locator('#sd-settings-open').click()
 await page.locator('input[name=autoFire]').check();await page.locator('select[name=difficulty]').select_option('cadet')
 await page.locator('#sd-settings-form button[type=submit]').click()
 assert await page.evaluate("JSON.parse(localStorage.getItem('eventHorizonStationDefense.settings')).autoFire")
 await page.locator('#sd-start').click();await page.locator('#sd-canvas').wait_for()
 await page.wait_for_timeout(3000)
 assert await page.evaluate('document.fullscreenElement?.id')=='sd-shell'
 assert await page.evaluate('window.__game.state')=='PLAYING'
 x=await page.evaluate('window.__game.player.x');await page.keyboard.down('ArrowRight');await page.wait_for_timeout(180);await page.keyboard.up('ArrowRight')
 assert await page.evaluate('window.__game.player.x')>x
 await page.keyboard.press('Shift');await page.keyboard.press('Digit1');await page.keyboard.press('Digit2')
 await page.evaluate('window.__game.station.hp=300');await page.keyboard.press('Digit3');await page.wait_for_timeout(200)
 assert await page.evaluate('window.__game.station.repairTime')>0
 assert await page.evaluate('window.__game.cooldowns.emp')>0
 # Exercise the full renderer/HUD with actual six enemy roles, boss and projectiles.
 await page.evaluate("""()=>{const g=window.__game;g.queue=[];g.warnings=[];g.enemies=[];g.wave=7;for(const [i,type] of ['scout','rusher','tank','shooter','splitter','shield'].entries())g.spawn(type,{x:300+i*230,y:260});g.spawn('boss',{x:960,y:180});}""")
 await page.wait_for_timeout(350);await page.screenshot(path='/tmp/sd-combat.png')
 canvas=await page.locator('#sd-canvas').evaluate('(c)=>({width:c.width,height:c.height,cssW:c.clientWidth,cssH:c.clientHeight})')
 assert canvas['width']==canvas['cssW']*2
 assert abs(canvas['cssW']/canvas['cssH']-16/9)<.01
 await page.evaluate('document.exitFullscreen()');await page.wait_for_timeout(200)
 assert await page.evaluate('window.__game.state')=='PAUSED';old=await page.evaluate('window.__game.elapsed');await page.wait_for_timeout(300);assert await page.evaluate('window.__game.elapsed')==old
 await page.get_by_role('button',name='전체화면으로 계속하기').click();await page.wait_for_timeout(200)
 assert await page.evaluate('window.__game.state')=='PLAYING'
 await page.evaluate("window.dispatchEvent(new Event('blur'))");await page.wait_for_timeout(100);assert await page.evaluate('window.__game.state')=='PAUSED'
 await page.get_by_role('button',name='전체화면으로 계속하기').click()
 # Upgrade selection via key uses card selection, not a skill.
 await page.evaluate("window.__game.enemies=[];window.__game.warnings=[];window.__game.queue=[];window.__game.state='WAVE_CLEAR';window.__game.timer=.01")
 await page.wait_for_timeout(200);assert await page.locator('.sd-upgrade').count()==3
 await page.screenshot(path='/tmp/sd-upgrade.png')
 level=await page.evaluate('Object.values(window.__game.levels).reduce((s,n)=>s+n,0)')
 await page.keyboard.press('Digit2');await page.wait_for_timeout(200)
 assert await page.evaluate('Object.values(window.__game.levels).reduce((s,n)=>s+n,0)')==level+1
 # Fail, retry without page navigation, and exit/re-enter twice.
 await page.evaluate('window.__game.player.hp=0');await page.wait_for_timeout(200)
 assert await page.get_by_role('button',name='다시 시작',exact=True).is_visible()
 await page.get_by_role('button',name='다시 시작',exact=True).click();await page.wait_for_timeout(100)
 assert await page.evaluate('window.__game.wave')==0;assert await page.evaluate('window.__game.cooldowns.emp')==0
 await page.locator('#sd-exit').click();assert await page.evaluate('document.body.style.overflow')!='hidden';assert await page.locator('#sd-canvas').count()==0
 for _ in range(2):
  await page.locator('#sd-start').click();await page.locator('#sd-canvas').wait_for();await page.locator('#sd-exit').click();assert await page.locator('#sd-canvas').count()==0
 # Existing board navigation remains intact.
 for tab in ['photos','creative','briefing','forum','book','dog','debate']:
  await page.locator('#tab-btn-'+tab).click();assert await page.locator('#tab-content-'+tab).is_visible()
 assert errors==[],errors
 await ctx.close();print('Desktop: gameplay, fullscreen exit, pause/resume, skills, upgrades, retry, repeated exit, Retina, old boards PASS')
async def mobile(browser):
 ctx=await browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,user_agent='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')
 await prepare(ctx);await ctx.add_init_script('window.__fullscreenCalls=0;Element.prototype.requestFullscreen=function(){window.__fullscreenCalls++;return Promise.resolve();}')
 page=await ctx.new_page();requests=[];page.on('request',lambda r:requests.append(r.url));await enter(page);await page.locator('#sd-start').click()
 assert await page.get_by_role('heading',name='PC 전용 게임입니다').is_visible();assert await page.locator('#sd-canvas').count()==0;assert await page.evaluate('window.__fullscreenCalls')==0
 assert not any('/art/' in url and 'hero.webp' not in url for url in requests)
 assert await page.evaluate('document.documentElement.scrollWidth<=innerWidth')
 await page.screenshot(path='/tmp/sd-mobile.png');await ctx.close();print('Mobile: PC-only modal, no assets/Canvas/fullscreen/loop, responsive intro PASS')
async def fallback(browser):
 ctx=await browser.new_context(viewport={'width':1280,'height':800});await prepare(ctx,True,True);page=await ctx.new_page();await enter(page);await page.locator('#sd-start').click();await page.locator('#sd-canvas').wait_for();await page.wait_for_timeout(2700)
 assert await page.evaluate('document.fullscreenElement') is None
 box=await page.locator('#sd-shell').bounding_box();assert box['width']==1280 and box['height']==800
 await page.set_viewport_size({'width':1200,'height':720});await page.wait_for_timeout(100);assert await page.evaluate('window.__game.station.x')==960
 await page.keyboard.press('KeyP');assert await page.evaluate('window.__game.state')=='PAUSED'
 await page.locator('#sd-settings-live').click();await page.locator('input[name=autoFire]').check();await page.locator('input[name=sound]').uncheck();await page.locator('#sd-settings-form button[type=submit]').click()
 await page.get_by_role('button',name='전체화면으로 계속하기').click();assert await page.evaluate('window.__game.settings.autoFire')
 await page.locator('#sd-exit').click();await ctx.close();print('Fallback: rejected fullscreen stays viewport-sized, resize, settings persistence/live apply PASS')
async def loading_exit(browser):
 ctx=await browser.new_context(viewport={'width':1280,'height':800});await prepare(ctx,True)
 async def slow_station(route):
  await asyncio.sleep(.8)
  await route.fulfill(path=str(ROOT/'assets/game/station-defense/art/station.webp'),content_type='image/webp')
 await ctx.route('**/art/station.webp',slow_station)
 page=await ctx.new_page();await enter(page);await page.locator('#sd-start').click()
 await page.wait_for_function("document.fullscreenElement?.id==='sd-shell'")
 await page.evaluate('document.exitFullscreen()');await page.locator('#sd-canvas').wait_for();await page.wait_for_timeout(100)
 assert await page.evaluate('window.__game.state')=='PAUSED'
 await page.keyboard.press('Escape');assert await page.evaluate('window.__game.state')=='PAUSED'
 await page.locator('#sd-exit').click();await ctx.close();print('Loading lifecycle: exiting fullscreen during preload pauses on ready; Escape does not silently resume PASS')
async def asset_fallback(browser):
 ctx=await browser.new_context(viewport={'width':1280,'height':800});await prepare(ctx,True,True)
 await ctx.route('**/art/background.webp',lambda r:r.fulfill(body='invalid-image',content_type='image/webp'))
 page=await ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 await enter(page);await page.locator('#sd-start').click();await page.locator('#sd-canvas').wait_for();await page.wait_for_timeout(2700)
 assert await page.evaluate('window.__game.state')=='PLAYING';assert errors==[],errors
 await page.locator('#sd-exit').click();await ctx.close();print('Asset failure: missing decorative background falls back and gameplay starts PASS')
async def main():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  await desktop(browser);await mobile(browser);await fallback(browser);await loading_exit(browser);await asset_fallback(browser);await browser.close()
asyncio.run(main())
