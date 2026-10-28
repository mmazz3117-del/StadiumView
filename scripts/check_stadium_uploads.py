#!/usr/bin/env python3
"""Read-only upload visibility. No API, secrets, JavaScript execution or deployment."""
import argparse
import html
import json
import os
from pathlib import Path
import re
import subprocess
import unicodedata

MANIFEST_PATH = 'stadium-upload-batch.v1.20.0.json'
BATCH_VERSION = '1.20.0'
MANIFEST_LIMIT = 100_000

class CheckError(Exception):
    pass

def safe_file(root, relative):
    if not isinstance(relative, str) or not relative or len(relative)>300:
        raise CheckError('An asset reference is invalid; unsafe text was not displayed.')
    if any(ord(c)<32 or ord(c)==127 or unicodedata.category(c)=='Cf' for c in relative) or '\\' in relative:
        raise CheckError('An asset reference is unsafe; unsafe text was not displayed.')
    parts=relative.split('/')
    if relative.startswith('/') or any(p in ('','.','..') for p in parts) or not relative.startswith('assets/') or any(c in relative for c in ':?#%'):
        raise CheckError('An asset reference is unsafe; unsafe text was not displayed.')
    p=root
    for part in parts:
        p=p/part
        if p.is_symlink(): raise CheckError('An asset path contains a symlink; no target was followed.')
    if p.exists() and not p.is_file(): raise CheckError('An asset path is not a regular file.')
    return p

def no_duplicates(pairs):
    result={}
    for key,value in pairs:
        if key in result: raise CheckError('The catalog contains duplicate JSON keys.')
        result[key]=value
    return result

def invalid_constant(value):
    raise CheckError('The catalog contains an invalid JSON number.')

def inspect_catalog(root, tracked=None, include_refs=False):
    path=root/'catalog.js'
    if path.is_symlink() or not path.is_file(): raise CheckError('catalog.js is missing or is not a safe regular file.')
    if path.stat().st_size>10_000_000: raise CheckError('catalog.js exceeds the upload-check size limit.')
    try:
        text=path.read_text(encoding='utf-8'); marker='window.STADIUMS = '
        if text.count(marker)!=1: raise CheckError('catalog.js does not contain exactly one supported stadium array.')
        raw=text.split(marker,1)[1].strip()
        if not raw.endswith(';'): raise CheckError('catalog.js has an unsupported array ending.')
        items=json.loads(raw[:-1], object_pairs_hook=no_duplicates, parse_constant=invalid_constant)
    except (UnicodeError,ValueError,RecursionError): raise CheckError('catalog.js cannot be parsed safely as JSON.') from None
    if not isinstance(items,list) or not items: raise CheckError('The current catalog has no supported school list.')
    ids=set(); refs=[]
    for item in items:
        if not isinstance(item,dict) or not isinstance(item.get('id'),str) or item['id'] in ids: raise CheckError('The catalog has invalid or duplicate school IDs.')
        ids.add(item['id']);views=item.get('views')
        if not isinstance(views,list) or not views: raise CheckError('A catalog school has no supported views.')
        for view in views:
            if not isinstance(view,dict): raise CheckError('A catalog view is invalid.')
            ref=view.get('src');safe_file(root,ref);refs.append(ref)
    if len(set(refs))!=len(refs): raise CheckError('The catalog has duplicate image references.')
    if tracked is None:
        missing=[ref for ref in refs if not safe_file(root,ref).is_file()]
    else:
        missing=[]
        for ref in refs:
            parts=ref.split('/')
            if any(tracked.get('/'.join(parts[:i])) not in (None,'100644','100755') for i in range(1,len(parts)+1)):
                raise CheckError('A referenced asset or parent is a symlink or unsupported Git entry.')
            if tracked.get(ref) not in ('100644','100755'): missing.append(ref)
    result=(len(items),len(refs),missing)
    return (*result,set(refs)) if include_refs else result

def inspect_manifest(root, tracked, after):
    """Validate the named manifest, then count its paths in the selected Git tree.

    The small local manifest must match that commit; no image blobs are read.
    This version intentionally recognizes only the installed v1.20.0 batch.
    """
    path=root/MANIFEST_PATH
    if path.is_symlink() or not path.is_file() or tracked.get(MANIFEST_PATH) not in ('100644','100755'):
        raise CheckError('The named v1.20.0 batch manifest is missing or is not a committed regular file.')
    if path.stat().st_size>MANIFEST_LIMIT:
        raise CheckError('The batch manifest exceeds the safe size limit.')
    if not re.fullmatch(r'[0-9a-fA-F]{40}',after or ''):
        raise CheckError('The checked commit identifier is invalid.')
    obj=f'{after}:{MANIFEST_PATH}'
    size=subprocess.run(['git','-C',str(root),'cat-file','-s',obj],stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False)
    if size.returncode or not re.fullmatch(rb'[0-9]+\n?',size.stdout) or int(size.stdout)>MANIFEST_LIMIT:
        raise CheckError('The committed batch manifest is unreadable or exceeds the safe size limit.')
    blob=subprocess.run(['git','-C',str(root),'cat-file','blob',obj],stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False)
    if blob.returncode or len(blob.stdout)!=int(size.stdout) or len(blob.stdout)>MANIFEST_LIMIT:
        raise CheckError('The committed batch manifest could not be read safely.')
    if path.read_bytes()!=blob.stdout:
        raise CheckError('The local batch manifest does not match the selected commit.')
    try:
        data=json.loads(blob.stdout.decode('utf-8'),object_pairs_hook=no_duplicates,parse_constant=invalid_constant)
    except (CheckError,UnicodeError,ValueError,RecursionError):
        raise CheckError('The batch manifest is not strict supported JSON.') from None
    expected={'schemaVersion','batchVersion','expectedSchools','expectedFiles','packCount','schools'}
    if not isinstance(data,dict) or set(data)!=expected:
        raise CheckError('The batch manifest schema is unsupported.')
    if any(type(data[k]) is not int for k in ('schemaVersion','expectedSchools','expectedFiles','packCount')) or (data['schemaVersion'],data['batchVersion'],data['expectedSchools'],data['expectedFiles'],data['packCount'])!=(1,BATCH_VERSION,20,40,10):
        raise CheckError('The batch manifest must identify exactly v1.20.0, 20 schools, 40 files and 10 packs.')
    if not isinstance(data['schools'],list) or len(data['schools'])!=20:
        raise CheckError('The batch manifest school count is invalid.')
    ids=set();paths=set();packs={i:[] for i in range(1,11)};missing=[]
    for item in data['schools']:
        if not isinstance(item,dict) or set(item)!={'id','school','pack','files'}:
            raise CheckError('The batch manifest contains an invalid school entry.')
        sid=item['id'];label=item['school'];pack=item['pack'];files=item['files']
        if not isinstance(sid,str) or len(sid)>100 or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*',sid) or sid in ids:
            raise CheckError('The batch manifest contains an invalid or duplicate school ID.')
        if not isinstance(label,str) or not 1<=len(label)<=100 or label.strip()!=label or not label.strip() or any(ord(c)<32 or ord(c)==127 or unicodedata.category(c) in ('Cf','Cs') for c in label):
            raise CheckError('The batch manifest contains an unsafe school label.')
        if type(pack) is not int or pack not in packs:
            raise CheckError('The batch manifest contains an invalid image-pack number.')
        pair=[f'assets/{sid}-aerial.png',f'assets/{sid}-reverse.png']
        if not isinstance(files,list) or files!=pair:
            raise CheckError('Each batch school must have its exact aerial/reverse PNG pair.')
        ids.add(sid);packs[pack].append(item)
        for ref in files:
            safe_file(root,ref)
            if ref in paths:raise CheckError('The batch manifest contains duplicate asset paths.')
            paths.add(ref);parts=ref.split('/')
            if any(tracked.get('/'.join(parts[:i])) not in (None,'100644','100755') for i in range(1,len(parts)+1)):
                raise CheckError('A batch asset or parent is a symlink or unsupported Git entry.')
            if tracked.get(ref) not in ('100644','100755'):missing.append(ref)
    if len(paths)!=40 or [len(packs[i]) for i in range(1,11)]!=[2]*10:
        raise CheckError('The batch manifest file or pack grouping is incomplete.')
    return data,missing,packs

def changed_files(root,before,after):
    if not re.fullmatch(r'[0-9a-fA-F]{40}',after or ''): raise CheckError('The checked commit identifier is invalid.')
    if before and not re.fullmatch(r'[0-9a-fA-F]{40}',before): raise CheckError('The previous commit identifier is invalid.')
    args=['git','-C',str(root)]
    if not before or before=='0'*40:
        command=args+['diff-tree','--root','--diff-merges=first-parent','--no-commit-id','--name-status','--no-renames','-r','-z',after,'--']
    else:
        command=args+['diff','--no-ext-diff','--name-status','--no-renames','-z',before,after,'--']
    result=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False)
    if result.returncode: raise CheckError('The commit change list could not be read. No command diagnostics were exposed.')
    parts=result.stdout.split(b'\0')
    if parts[-1]==b'': parts.pop()
    if len(parts)%2: raise CheckError('The commit change list has an unexpected format.')
    return [(parts[i].decode('ascii','replace'),parts[i+1].decode('utf-8','replace')) for i in range(0,len(parts),2)]

def tracked_files(root,after):
    result=subprocess.run(['git','-C',str(root),'ls-tree','-r','-z','--full-tree',after,'--'],stdout=subprocess.PIPE,stderr=subprocess.PIPE,check=False)
    if result.returncode: raise CheckError('The committed file inventory could not be read.')
    tracked={}
    try:
        for record in result.stdout.split(b'\0'):
            if not record: continue
            metadata,name=record.split(b'\t',1)
            mode,kind,oid=metadata.split(b' ')
            tracked[name.decode('utf-8','strict')]=mode.decode('ascii','strict')
    except (ValueError,UnicodeError): raise CheckError('The committed file inventory has an unsupported format.') from None
    return tracked

def code(value):
    # HTML escaping prevents uploaded filenames becoming links/markup in summaries.
    # Control characters are shown as escaped text, never as terminal commands.
    text=''.join(c if ord(c)>=32 and ord(c)!=127 and unicodedata.category(c)!='Cf' else '\\u%04x'%ord(c) for c in value)
    return '<code>'+html.escape(text,quote=True)+'</code>'

def run(root,before,after):
    summary=['# Stadium Atlas upload check','', '**Committed file presence only: current catalog plus the named v1.20.0 batch. This does NOT verify image decoding/pixels, records, app-version compatibility or deployment.**','']
    failed=False;catalog_ok=False;batch_ok=False;catalog_refs=None
    try:
        changed=changed_files(root,before,after)
        tracked=tracked_files(root,after)
        scope='this push' if before and before!='0'*40 else 'the selected commit'
        summary += [f'## Files changed in {scope}: {len(changed)}','']
        summary += ['- '+code(status)+' '+code(name) for status,name in changed[:500]]
        if len(changed)>500: summary.append(f'Only the first 500 changes are displayed; total: {len(changed)}.')
        summary += ['', 'Manual runs show the selected commit against its first parent (or initial commit files), not a new upload.','']
    except CheckError as e:
        report='\n'.join(summary+['## Check stopped safely','',str(e)])+'\n'
        print(report);return 1,report
    try:
        schools,views,missing,catalog_refs=inspect_catalog(root,tracked,include_refs=True)
        summary += [f'## Current catalog: {schools} schools / {views} referenced images','',f'**Committed regular files present: {views-len(missing)} / {views}. Missing: {len(missing)}.**','']
        if missing:
            failed=True
            summary += ['### Current catalog upload incomplete','']+['- '+code(x) for x in missing]
        else:
            catalog_ok=True;summary += ['Current catalog integrity: referenced files present.','']
    except CheckError as e:
        failed=True;summary += ['## Current catalog check stopped safely','',str(e),'']
    try:
        data,missing,packs=inspect_manifest(root,tracked,after)
        missing_set=set(missing)
        complete=sum(not missing_set.intersection(item['files']) for item in data['schools'])
        batch_ok=not missing
        summary += ['## Active named batch: v1.20.0','',f'**Batch files present: {40-len(missing)} / 40. Missing: {len(missing)}.**',f'**Complete school pairs: {complete} / 20.**','']
        if catalog_refs is not None:
            referenced=sum(ref in catalog_refs for item in data['schools'] for ref in item['files'])
            summary += [f'Batch paths referenced by current catalog: {referenced} / 40.']
            if referenced!=40:summary += ['The current catalog does not yet reference this entire batch. File presence does not establish that matching new app files are installed.']
        summary += ['', '### School pairs','']
        for item in data['schools']:
            absent=[ref for ref in item['files'] if ref in missing_set]
            summary += ['- '+code(item['school'])+f': {2-len(absent)} / 2'+(' — complete pair' if not absent else ' — incomplete')]
            summary += ['  - Missing '+code(ref) for ref in absent]
        summary += ['', '### Original image packs','']
        for pack,items in packs.items():
            refs=[ref for item in items for ref in item['files']]
            present=sum(ref not in missing_set for ref in refs)
            pairs=sum(not missing_set.intersection(item['files']) for item in items)
            filename=f'Stadium-Atlas-v1.20.0-images-part-{pack:02d}-of-10.zip'
            summary += ['- '+code(filename)+f': {present} / {len(refs)} files; {pairs} / {len(items)} complete school pairs.']
        if missing:
            failed=True
            summary += ['', '## Upload incomplete — named batch files still needed','', 'This is expected during a partial upload. Starting at repository ROOT, open the existing assets folder and upload the missing bare PNG files. Exact ROOT-relative paths are listed above under each school.']
    except CheckError as e:
        failed=True;summary += ['## Named batch check stopped safely','',str(e),'No batch-completion claim can be made.']
    if catalog_ok and batch_ok:
        summary += ['', '## Catalog-referenced files and named v1.20.0 batch files present — deployment NOT verified','', 'A green upload check means only these two file-presence checks passed. Check the separate Refresh Stadium Atlas records workflow after uploading the matching app files.']
    else:
        summary += ['', '## Upload incomplete or check stopped — no overall completion claim']
    summary += ['', 'Presence is checked against the selected commit’s Git file inventory, not image contents. The installed manifest recognizes only v1.20.0; it cannot establish a complete future batch automatically. A later batch requires its own updated named manifest and workflow path. Only the latest commit’s result describes the latest committed upload state.']
    report='\n'.join(summary)+'\n'
    print(report)
    return (1 if failed else 0),report

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,default=Path('.'));args=parser.parse_args()
    try:
        status,report=run(args.source.resolve(),os.environ.get('UPLOAD_BEFORE',''),os.environ.get('UPLOAD_AFTER',''))
    except OSError:
        status,report=1,'# Upload check stopped safely\nA required local file could not be read.\n';print(report)
    summary=os.environ.get('GITHUB_STEP_SUMMARY')
    if summary:
        try:
            with open(summary,'a',encoding='utf-8') as f:f.write(report)
        except OSError:
            print('The Actions summary could not be written.');status=1
    return status

if __name__=='__main__': raise SystemExit(main())
