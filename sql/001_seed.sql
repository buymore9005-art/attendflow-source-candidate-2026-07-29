-- AttendFlow optional demonstration seed.
-- Run 000_full_schema.sql first, sign in, create an organization, then execute:
-- select public.seed_demo_data_for_current_user();
-- The function is idempotent for records identified by DEMO codes.

begin;

create or replace function public.seed_demo_data(p_organization_id uuid) returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare
  v_time_zone text;
  v_general_department uuid;
  v_hr_department uuid;
  v_operations_department uuid;
  v_staff_position uuid;
  v_supervisor_position uuid;
  v_regular_shift uuid;
  v_night_shift uuid;
  v_device_id uuid;
  v_employee_1 uuid;
  v_employee_2 uuid;
  v_employee_3 uuid;
  v_employee_4 uuid;
  v_day date;
  v_inserted_attendance integer := 0;
begin
  if auth.role() <> 'service_role' and not public.has_permission(p_organization_id,'settings.update') then
    raise exception 'Forbidden' using errcode='42501';
  end if;

  select time_zone into v_time_zone from public.organizations where id=p_organization_id and is_active=true;
  if not found then raise exception 'Organization not found' using errcode='P0002'; end if;

  insert into public.departments(organization_id,code,name,is_active)
  values(p_organization_id,'GENERAL','General',true)
  on conflict(organization_id,code) do update set name=excluded.name,is_active=true,deleted_at=null,updated_at=now()
  returning id into v_general_department;

  insert into public.departments(organization_id,code,name,is_active)
  values(p_organization_id,'HR','Human Resources',true)
  on conflict(organization_id,code) do update set name=excluded.name,is_active=true,deleted_at=null,updated_at=now()
  returning id into v_hr_department;

  insert into public.departments(organization_id,code,name,parent_id,is_active)
  values(p_organization_id,'OPS','Operations',v_general_department,true)
  on conflict(organization_id,code) do update set name=excluded.name,parent_id=excluded.parent_id,is_active=true,deleted_at=null,updated_at=now()
  returning id into v_operations_department;

  insert into public.positions(organization_id,code,name,level,is_active)
  values(p_organization_id,'STAFF','Staff',1,true)
  on conflict(organization_id,code) do update set name=excluded.name,level=excluded.level,is_active=true,deleted_at=null,updated_at=now()
  returning id into v_staff_position;

  insert into public.positions(organization_id,code,name,level,is_active)
  values(p_organization_id,'SUPERVISOR','Supervisor',3,true)
  on conflict(organization_id,code) do update set name=excluded.name,level=excluded.level,is_active=true,deleted_at=null,updated_at=now()
  returning id into v_supervisor_position;

  insert into public.shifts(organization_id,code,name,shift_type,start_time,end_time,break_minutes,grace_minutes,late_tolerance_minutes,early_leave_tolerance_minutes,overtime_after_minutes,cross_midnight,is_active)
  values(p_organization_id,'REGULAR','Regular 08:00-17:00','fixed','08:00','17:00',60,10,0,10,30,false,true)
  on conflict(organization_id,code) do update set name=excluded.name,shift_type=excluded.shift_type,start_time=excluded.start_time,end_time=excluded.end_time,break_minutes=excluded.break_minutes,grace_minutes=excluded.grace_minutes,late_tolerance_minutes=excluded.late_tolerance_minutes,early_leave_tolerance_minutes=excluded.early_leave_tolerance_minutes,overtime_after_minutes=excluded.overtime_after_minutes,cross_midnight=excluded.cross_midnight,is_active=true,deleted_at=null,updated_at=now()
  returning id into v_regular_shift;

  insert into public.shifts(organization_id,code,name,shift_type,start_time,end_time,break_minutes,grace_minutes,late_tolerance_minutes,early_leave_tolerance_minutes,overtime_after_minutes,cross_midnight,is_active)
  values(p_organization_id,'NIGHT','Night 22:00-06:00','night','22:00','06:00',60,10,0,10,30,true,true)
  on conflict(organization_id,code) do update set name=excluded.name,shift_type=excluded.shift_type,start_time=excluded.start_time,end_time=excluded.end_time,break_minutes=excluded.break_minutes,grace_minutes=excluded.grace_minutes,late_tolerance_minutes=excluded.late_tolerance_minutes,early_leave_tolerance_minutes=excluded.early_leave_tolerance_minutes,overtime_after_minutes=excluded.overtime_after_minutes,cross_midnight=excluded.cross_midnight,is_active=true,deleted_at=null,updated_at=now()
  returning id into v_night_shift;

  insert into public.employees(organization_id,employee_no,full_name,gender,phone,email,department_id,position_id,status,shift_id,join_date,bpjs_status,bank_name,bank_account_name,emergency_contact_name,emergency_contact_phone,notes,fingerprint_pin,is_active)
  values(p_organization_id,'DEMO-001','Ayu Pratama','female','+620000000001','ayu.pratama@example.invalid',v_hr_department,v_supervisor_position,'active',v_regular_shift,(current_date-interval '2 years')::date,true,'Demo Bank','Ayu Pratama','Budi Pratama','+620000009001','Demonstration data','1001',true)
  on conflict(organization_id,employee_no) do update set full_name=excluded.full_name,department_id=excluded.department_id,position_id=excluded.position_id,shift_id=excluded.shift_id,status='active',is_active=true,deleted_at=null,updated_at=now()
  returning id into v_employee_1;

  insert into public.employees(organization_id,employee_no,full_name,gender,phone,email,department_id,position_id,status,shift_id,join_date,bpjs_status,bank_name,bank_account_name,emergency_contact_name,emergency_contact_phone,notes,fingerprint_pin,is_active)
  values(p_organization_id,'DEMO-002','Bima Santoso','male','+620000000002','bima.santoso@example.invalid',v_operations_department,v_staff_position,'active',v_regular_shift,(current_date-interval '18 months')::date,true,'Demo Bank','Bima Santoso','Citra Santoso','+620000009002','Demonstration data','1002',true)
  on conflict(organization_id,employee_no) do update set full_name=excluded.full_name,department_id=excluded.department_id,position_id=excluded.position_id,shift_id=excluded.shift_id,status='active',is_active=true,deleted_at=null,updated_at=now()
  returning id into v_employee_2;

  insert into public.employees(organization_id,employee_no,full_name,gender,phone,email,department_id,position_id,status,shift_id,join_date,bpjs_status,bank_name,bank_account_name,emergency_contact_name,emergency_contact_phone,notes,fingerprint_pin,is_active)
  values(p_organization_id,'DEMO-003','Chen Wei','male','+620000000003','chen.wei@example.invalid',v_operations_department,v_staff_position,'active',v_night_shift,(current_date-interval '1 year')::date,false,'Demo Bank','Chen Wei','Li Na','+620000009003','Demonstration data','1003',true)
  on conflict(organization_id,employee_no) do update set full_name=excluded.full_name,department_id=excluded.department_id,position_id=excluded.position_id,shift_id=excluded.shift_id,status='active',is_active=true,deleted_at=null,updated_at=now()
  returning id into v_employee_3;

  insert into public.employees(organization_id,employee_no,full_name,gender,phone,email,department_id,position_id,status,shift_id,join_date,bpjs_status,bank_name,bank_account_name,emergency_contact_name,emergency_contact_phone,notes,fingerprint_pin,is_active)
  values(p_organization_id,'DEMO-004','Dewi Lestari','female','+620000000004','dewi.lestari@example.invalid',v_general_department,v_staff_position,'probation',v_regular_shift,(current_date-interval '2 months')::date,false,'Demo Bank','Dewi Lestari','Eko Lestari','+620000009004','Demonstration data','1004',true)
  on conflict(organization_id,employee_no) do update set full_name=excluded.full_name,department_id=excluded.department_id,position_id=excluded.position_id,shift_id=excluded.shift_id,status='probation',is_active=true,deleted_at=null,updated_at=now()
  returning id into v_employee_4;

  update public.departments set manager_employee_id=v_employee_1,updated_at=now() where organization_id=p_organization_id and id=v_hr_department;
  update public.departments set manager_employee_id=v_employee_1,updated_at=now() where organization_id=p_organization_id and id=v_general_department;

  insert into public.shift_assignments(organization_id,employee_id,shift_id,effective_from)
  values
    (p_organization_id,v_employee_1,v_regular_shift,(current_date-interval '2 years')::date),
    (p_organization_id,v_employee_2,v_regular_shift,(current_date-interval '18 months')::date),
    (p_organization_id,v_employee_3,v_night_shift,(current_date-interval '1 year')::date),
    (p_organization_id,v_employee_4,v_regular_shift,(current_date-interval '2 months')::date)
  on conflict(organization_id,employee_id,effective_from) do update set shift_id=excluded.shift_id,effective_to=null,updated_at=now();

  insert into public.payroll_profiles(organization_id,employee_id,base_type,daily_salary,monthly_salary,overtime_hourly_rate,late_deduction_per_minute,absence_deduction_per_day,early_deduction_per_minute,default_bonus,tax_percent,bpjs_employee_percent,work_days_per_month,effective_from)
  values
    (p_organization_id,v_employee_1,'monthly',0,9500000,70000,2500,430000,2500,500000,5,1,22,date_trunc('year',current_date)::date),
    (p_organization_id,v_employee_2,'monthly',0,6500000,50000,2000,300000,2000,250000,3,1,22,date_trunc('year',current_date)::date),
    (p_organization_id,v_employee_3,'monthly',0,7000000,55000,2000,320000,2000,300000,3,1,22,date_trunc('year',current_date)::date),
    (p_organization_id,v_employee_4,'daily',300000,0,45000,1500,300000,1500,0,0,0,22,date_trunc('year',current_date)::date)
  on conflict(organization_id,employee_id,effective_from) do update set base_type=excluded.base_type,daily_salary=excluded.daily_salary,monthly_salary=excluded.monthly_salary,overtime_hourly_rate=excluded.overtime_hourly_rate,late_deduction_per_minute=excluded.late_deduction_per_minute,absence_deduction_per_day=excluded.absence_deduction_per_day,early_deduction_per_minute=excluded.early_deduction_per_minute,default_bonus=excluded.default_bonus,tax_percent=excluded.tax_percent,bpjs_employee_percent=excluded.bpjs_employee_percent,work_days_per_month=excluded.work_days_per_month,updated_at=now();

  insert into public.attendance_devices(organization_id,vendor,protocol,name,location,ip_address,port,serial_number,firmware,status,auto_sync,metadata)
  values(p_organization_id,'zkteco','adms','Demo ZKTeco Gate','Main Entrance','192.0.2.10',4370,'DEMO-ZK-001','Demo 1.0','offline',true,jsonb_build_object('demo',true))
  on conflict(organization_id,serial_number) do update set name=excluded.name,location=excluded.location,ip_address=excluded.ip_address,port=excluded.port,firmware=excluded.firmware,auto_sync=true,deleted_at=null,metadata=excluded.metadata,updated_at=now()
  returning id into v_device_id;

  insert into public.biometric_enrollments(organization_id,employee_id,device_id,device_user_id,pin,card_number,fingerprint_templates,has_face,has_card,status,last_synced_at)
  values
    (p_organization_id,v_employee_1,v_device_id,'1001','1001','90000001',2,true,true,'synced',now()-interval '1 day'),
    (p_organization_id,v_employee_2,v_device_id,'1002','1002','90000002',1,false,true,'synced',now()-interval '1 day'),
    (p_organization_id,v_employee_3,v_device_id,'1003','1003',null,1,false,false,'synced',now()-interval '1 day')
  on conflict(organization_id,employee_id,device_id) do update set device_user_id=excluded.device_user_id,pin=excluded.pin,card_number=excluded.card_number,fingerprint_templates=excluded.fingerprint_templates,has_face=excluded.has_face,has_card=excluded.has_card,status=excluded.status,last_synced_at=excluded.last_synced_at,error_message=null,updated_at=now();

  for v_day in select generate_series(current_date-13,current_date,'1 day')::date loop
    if extract(isodow from v_day) between 1 and 5 then
      insert into public.attendance_records(organization_id,employee_id,work_date,shift_id,clock_in,clock_out,work_minutes,overtime_minutes,late_minutes,early_leave_minutes,status,location,device_id,source)
      values(
        p_organization_id,
        v_employee_1,
        v_day,
        v_regular_shift,
        (v_day + time '07:55') at time zone v_time_zone,
        (v_day + time '17:10') at time zone v_time_zone,
        495,
        0,
        0,
        0,
        'present',
        'Main Entrance',
        v_device_id,
        'system'
      )
      on conflict(organization_id,employee_id,work_date) do nothing;
      if found then v_inserted_attendance := v_inserted_attendance + 1; end if;

      insert into public.attendance_records(organization_id,employee_id,work_date,shift_id,clock_in,clock_out,work_minutes,overtime_minutes,late_minutes,early_leave_minutes,status,location,device_id,source)
      values(
        p_organization_id,
        v_employee_2,
        v_day,
        v_regular_shift,
        (v_day + case when v_day=current_date-2 then time '08:25' else time '08:04' end) at time zone v_time_zone,
        (v_day + case when v_day=current_date-3 then time '16:35' else time '17:35' end) at time zone v_time_zone,
        480,
        case when v_day=current_date-1 then 5 else 0 end,
        case when v_day=current_date-2 then 15 else 0 end,
        case when v_day=current_date-3 then 15 else 0 end,
        case when v_day=current_date-2 then 'late'::public.attendance_status else 'present'::public.attendance_status end,
        'Main Entrance',
        v_device_id,
        'system'
      )
      on conflict(organization_id,employee_id,work_date) do nothing;
      if found then v_inserted_attendance := v_inserted_attendance + 1; end if;

      insert into public.attendance_records(organization_id,employee_id,work_date,shift_id,clock_in,clock_out,work_minutes,overtime_minutes,late_minutes,early_leave_minutes,status,location,device_id,source)
      values(
        p_organization_id,
        v_employee_4,
        v_day,
        v_regular_shift,
        case when v_day=current_date-4 then null else (v_day + time '08:08') at time zone v_time_zone end,
        case when v_day=current_date-4 then null else (v_day + time '17:03') at time zone v_time_zone end,
        case when v_day=current_date-4 then 0 else 475 end,
        0,
        0,
        0,
        case when v_day=current_date-4 then 'absent'::public.attendance_status else 'present'::public.attendance_status end,
        'Main Entrance',
        v_device_id,
        'system'
      )
      on conflict(organization_id,employee_id,work_date) do nothing;
      if found then v_inserted_attendance := v_inserted_attendance + 1; end if;
    end if;
  end loop;

  insert into public.holidays(organization_id,holiday_date,name,is_paid)
  values(p_organization_id,make_date(extract(year from current_date)::integer,1,1),'New Year',true)
  on conflict(organization_id,holiday_date) do update set name=excluded.name,is_paid=excluded.is_paid,updated_at=now();

  if not exists(select 1 from public.leave_requests where organization_id=p_organization_id and employee_id=v_employee_3 and reason='Demonstration annual leave') then
    insert into public.leave_requests(organization_id,request_number,employee_id,leave_type,start_date,end_date,total_days,reason,status,approved_by,approved_at)
    values(p_organization_id,'',v_employee_3,'leave',current_date+7,current_date+8,2,'Demonstration annual leave','approved',auth.uid(),now());
  end if;

  insert into public.financial_adjustments(organization_id,employee_id,adjustment_type,amount,effective_date,description,reference_no)
  select p_organization_id,v_employee_2,'bonus',250000,current_date,'Demonstration performance bonus','DEMO-BONUS-001'
  where not exists(select 1 from public.financial_adjustments where organization_id=p_organization_id and reference_no='DEMO-BONUS-001');

  insert into public.integrations(organization_id,provider,name,is_enabled,configuration)
  values(p_organization_id,'deli','Deli E+',false,jsonb_build_object('attendance_auto_sync',false,'attendance_sync_interval_minutes',15,'attendance_next_id',0,'attendance_initialized',false))
  on conflict(organization_id,provider,name) do update set configuration=public.integrations.configuration||excluded.configuration,updated_at=now();

  insert into public.system_notifications(organization_id,notification_type,title_key,message_key,params,severity)
  select p_organization_id,'seed','dashboard.systemNotifications','notification.saved',jsonb_build_object('module','demo_seed'),'success'
  where not exists(select 1 from public.system_notifications where organization_id=p_organization_id and notification_type='seed');

  perform public.log_organization_activity(p_organization_id,'setting','seed_demo_data','organizations',p_organization_id::text,jsonb_build_object('attendance_rows',v_inserted_attendance));

  return jsonb_build_object(
    'organization_id',p_organization_id,
    'departments',3,
    'positions',2,
    'shifts',2,
    'employees',4,
    'devices',1,
    'attendance_rows_inserted',v_inserted_attendance
  );
end $$;

create or replace function public.seed_demo_data_for_current_user() returns jsonb
language plpgsql security definer set search_path=public,auth as $$
declare v_organization_id uuid;
begin
  select organization_id into v_organization_id
  from public.organization_members
  where user_id=auth.uid() and status='active'
  order by created_at
  limit 1;
  if v_organization_id is null then
    raise exception 'No active organization membership found' using errcode='P0002';
  end if;
  return public.seed_demo_data(v_organization_id);
end $$;

revoke all on function public.seed_demo_data(uuid) from public,anon,authenticated;
revoke all on function public.seed_demo_data_for_current_user() from public,anon,authenticated;
grant execute on function public.seed_demo_data(uuid) to authenticated,service_role;
grant execute on function public.seed_demo_data_for_current_user() to authenticated;

commit;
