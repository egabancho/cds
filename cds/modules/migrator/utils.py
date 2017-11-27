# -*- coding: utf-8 -*-
#
# This file is part of CERN Document Server.
# Copyright (C) 2017 CERN.
#
# CERN Document Server is free software; you can redistribute it
# and/or modify it under the terms of the GNU General Public License as
# published by the Free Software Foundation; either version 2 of the
# License, or (at your option) any later version.
#
# CERN Document Server is distributed in the hope that it will be
# useful, but WITHOUT ANY WARRANTY; without even the implied warranty of
# MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the GNU
# General Public License for more details.
#
# You should have received a copy of the GNU General Public License
# along with CERN Document Server; if not, write to the
# Free Software Foundation, Inc., 59 Temple Place, Suite 330, Boston,
# MA 02111-1307, USA.
#
# In applying this license, CERN does not
# waive the privileges and immunities granted to it by virtue of its status
# as an Intergovernmental Organization or submit itself to any jurisdiction.
"""Migration utils."""

from flask import current_app

from invenio_pidstore.fetchers import FetchedPID
from invenio_pidstore.models import PersistentIdentifier

from ..records.providers import CDSReportNumberProvider


def process_fireroles(fireroles):
    """Extract firerole definitions."""
    rigths = set()
    for firerole in fireroles:
        for (allow, not_, field, expressions_list) in firerole[1]:
            if not allow:
                current_app.logger.warning(
                    'Not possible to migrate deny rules: {0}.'.format(
                        expressions_list))
                continue
            if not_:
                current_app.logger.warning(
                    'Not possible to migrate not rules: {0}.'.format(
                        expressions_list))
                continue
            if field in ('remote_ip', 'until', 'from'):
                current_app.logger.warning(
                    'Not possible to migrate {0} rule: {1}.'.format(
                        field, expressions_list))
                continue
            # We only deal with allow group rules
            for reg, expr in expressions_list:
                if reg:
                    current_app.logger.warning(
                        'Not possible to migrate groups based on regular'
                        ' expressions: {0}.'.format(expr))
                    continue
                clean_name = expr[:-len(' [CERN]')].lower().strip().replace(
                    ' ', '-')
                rigths.add('{0}@cern.ch'.format(clean_name))
    return rigths


def update_access(data, *access):
    """Merge access rights information.

    :params data: current JSON structure with metadata and potentially an
        `_access` key.
    :param *access: List of dictionaries to merge to the original data, each of
        them in the form `action: []`.
    """
    current_rules = data.get('_access', {})
    for a in access:
        for k, v in a.items():
            current_x_rules = set(current_rules.get(k, []))
            current_x_rules.update(v)
            current_rules[k] = list(current_x_rules)

    data['_access'] = current_rules


def _get_next_project_report_number(category, type_, year):
    """Find the next valid project report number."""
    query = PersistentIdentifier.query.filter(
        PersistentIdentifier.pid_value.contains('{0}-{1}-{2}'.format(
            category, type_, year)))
    projects = [
        pid.pid_value for pid in query.all() if pid.pid_value.count('-') == 3
    ]
    max_count = max([int(pid.split('-')[-1]) for pid in projects])

    return '{0}-{1}-{2}-{3:03d}'.format(category, type_, year, max_count + 1)


def cern_movie_to_video_pid_fetcher(record_uuid, data):
    """Create a parallel pid for CERN movie and videoclip pid."""
    splitted = str(data['report_number'][0]).split('-')
    if len(splitted) > 2 and splitted[1] in ['MOVIE', 'VIDEOCLIP']:
        splitted[1] = 'VIDEO'
        report_number = '-'.join(splitted)

        if PersistentIdentifier.query.filter(
                PersistentIdentifier.pid_value == report_number).one_or_none():
            # The new report number is already in use.
            category, type_, year = report_number.split('-')[0:3]
            is_video = report_number.count('-') == 4
            report_number = _get_next_project_report_number(
                category, type_, year)
            if is_video:
                report_number = '{0}-001'.format(report_number)

        # update report number
        data['report_number'][0] = report_number
        # and create a new one with the new value
        return FetchedPID(
            provider=CDSReportNumberProvider,
            pid_type='rn',
            pid_value=report_number, )
