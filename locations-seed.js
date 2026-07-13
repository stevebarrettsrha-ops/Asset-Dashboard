/* ============================================================
   Location Records — seed data
   Departments, wards and rooms scaffolded from the May Pen
   Hospital location-record folders. Rooms start empty (ready
   to fill) except the two sample rooms in Front Administration,
   which are fully populated to demonstrate the expected format.

   This file only supplies the INITIAL data. Once the user has
   saved records to their browser (localStorage), this seed is
   no longer used, so their edits are never overwritten.
   ============================================================ */
function SEED_DEPARTMENTS() {
    let seq = 0;
    const rid = () => 'seed_r_' + (++seq);
    const iid = () => 'seed_i_' + (++seq);

    // helper: build a room with optional items
    // items given as [item, description, assetCode, remarks]
    function room(title, date, items) {
        return {
            id: rid(),
            title: title,
            verifiedBy: '',
            dateUpdated: date || '',
            note: '',
            items: (items || []).map(a => ({
                id: iid(),
                item: a[0] || '',
                description: a[1] || '',
                assetCode: a[2] || '',
                remarks: a[3] || ''
            }))
        };
    }
    // helper: quick empty rooms from a list of titles
    function rooms(titles) { return titles.map(t => room(t, '')); }

    const FA_DATE = 'Thursday, 24 October 2024';

    // ---- Sample: CCTV Office (from the attached location record) ----
    const cctvItems = [
        ['CCTV Monitor', 'Large Monitor (Samsung) - Closed Circuit Television', '', ''],
        ['CCTV Monitor', 'Large Monitor (Samsung) - Closed Circuit Television', '', ''],
        ['CCTV Monitor', 'Large Monitor (Samsung) - Closed Circuit Television', '', ''],
        ['CCTV Monitor', 'Large Monitor (Samsung) - Closed Circuit Television', '', ''],
        ['Office Desk', 'Executive Desk w/5 Drawers', 'MPH/162/01/SMO', ''],
        ['Office Chair', 'Executive Chair', 'MPH/133/01/CS', ''],
        ['Cabinet', '4 Drawer Cabinet', '', ''],
        ['Bin', 'Garbage Bin', '', ''],
        ['AC System', 'Air Conditioner', 'MPH/149/04/ADM', ''],
        ['Kettle', 'Kettle', 'MPH/309/01/SP', ''],
        ['CPU System', 'Central Processing Unit (CPU)', '', ''],
        ['CPU System', 'Central Processing Unit (CPU)', '', ''],
        ['CPU System', 'Central Processing Unit (CPU)', '', ''],
        ['CPU System', 'Central Processing Unit (CPU)', '', ''],
        ['CPU System', 'Central Processing Unit (CPU)', '', ''],
        ['CPU System', 'Central Processing Unit (CPU)', '', ''],
        ['CPU System', 'Central Processing Unit (CPU)', '', ''],
        ['CPU System', 'Central Processing Unit (CPU)', '', ''],
        ['CPU System', 'Central Processing Unit (CPU)', '', ''],
        ['Computer System (CPU and Monitor)', 'Computer System (Monitor, Keyboard and Mouse)', '', ''],
        ['Folding Chair', 'Plastic Chair (Yellow and Black) - Folding', '', ''],
        ['Folding Chair', 'Plastic Chair (Yellow and Black) - Folding', '', ''],
        ['Office Chair', 'Executive Chair', 'MPH/133/01/SMO', '']
    ];

    // ---- Sample: Conference Area (from the attached location record) ----
    const confItems = [
        ['Arm Chair', '2 Seat Arm Chair', '', ''],
        ['Arm Chair', '2 Seat Arm Chair', '', ''],
        ['Arm Chair', '2 Seat Arm Chair', '', ''],
        ['Arm Chair', 'Arm Chair', '', ''],
        ['Arm Chair', 'Arm Chair', '', ''],
        ['Arm Chair', '2 Seat Arm Chair (Gray)', '', ''],
        ['Arm Chair', 'Arm Chair (Dark Blue)', '', ''],
        ['5 Attached Stock Chair', '5 Attached Stock Chair', '', ''],
        ['Settee - Single', 'Settee Single', '', 'Personal - UHWI'],
        ['Settee - Long', 'Long Settee', '', 'Personal - UHWI'],
        ['Small Table', 'Dinner Chair', '', 'Personal - UHWI'],
        ['Bin', 'Step-on Bin (Large)', '', ''],
        ['Speaker', 'Speaker Podium', '', ''],
        ['Lunch Table', 'Large Lunch Bench (Baige) w/Wheels', '', ''],
        ['Arm Chair', '2 Seat Arm Chair', '', ''],
        ['Arm Chair', '2 Seat Arm Chair', '', '']
    ];

    return [
        {
            id: 'seed_d_front_admin',
            name: 'Front Administration',
            icon: '🏢',
            location: 'Front Administrative Department',
            note: 'Ground floor — Front Administrative Department',
            rooms: [
                room('CCTV Office', FA_DATE, cctvItems),
                room('Conference Area', FA_DATE, confItems),
                room('Emergency Operating Centre (EOC) Room', ''),
                room('Passage Way (Lunch Room)', ''),
                room('Room 2B-1002 (Infection Control)', ''),
                room('Room 2B-1008 (Lunch Room)', ''),
                room('Room 2B-1009 (Doctors Room)', ''),
                room('Room 2B-1010 (Recreational Room)', ''),
                room('Room 2B-1012 (Main Cashier Office)', ''),
                room('Customer Service Department', ''),
                room('Sr Customer Service Officer (Manager)', ''),
                room('Police Post', ''),
                room('Reception Area / Telephone Operator', ''),
                room('Room 2B-007', ''),
                room('Transport Department', ''),
                room('Sleeping Quarters - Transport', '')
            ]
        },
        {
            id: 'seed_d_female_medical',
            name: 'Female Medical Ward',
            icon: '🛏️',
            location: 'Female Medical Ward',
            note: 'Inpatient ward',
            rooms: rooms([
                'Female Medical Ward (General)',
                'Nurses Station',
                'Passage Way (Between Patient Bays)',
                'Passage Way (Beside IA-075)',
                'Room IA-068 (Patient Bay)',
                'Room IA-069 (Patient Bay)',
                'Room IA-070 (Patient Bay)',
                'Room IA-071 (Patient Bay)',
                'Room IA-073 (Ante Room)',
                'Room IA-075',
                'Room IA-077',
                'Room IA-078 (Patient Bay)',
                'Room IA-079 (Pantry)',
                'Room IA-091 (Equipment Storage)',
                'Room IA-092 (Clean Supply)',
                'Room IA-093 (Sluice / Soiled Utility)',
                'Room IA-094',
                'Room IA-095 (Medication Alcove)',
                'Room IA-097 (Lounge / Conference)',
                'Room IA-098 (Nursing Office)',
                'Storage Area'
            ])
        },
        {
            id: 'seed_d_female_surgical',
            name: 'Female Surgical Ward',
            icon: '🩺',
            location: 'Female Surgical Ward',
            note: 'Inpatient ward (Once OPD)',
            rooms: rooms([
                'Female Surgical Ward (Once OPD)',
                'Nurses Station',
                'Patient Bay (Open Area)',
                'Patient Waiting Area',
                'Room 2R 002 (Equipment Store)',
                'Room 2R 004 (Used as Pantry)',
                'Room 2R 005 (Patient Room)',
                'Room 2R 006',
                'Room 2R 007 (Examination Room)',
                'Room 2R 012',
                'Room 2R 014',
                'Room 2R 015',
                'Room 2R 018 (Exam / Treatment Room)',
                'Room 2R 019',
                'Room 2R 020 (Exam / Treatment Room)'
            ])
        },
        {
            id: 'seed_d_1st_floor_admin',
            name: '1st Floor General Admin',
            icon: '🗂️',
            location: '1st Floor General Administration',
            note: 'First floor — General Administration',
            rooms: rooms([
                'Biomedical Engineer',
                'Consultant Office - Surgeon',
                'Medical Social Worker',
                'Medicine Consultant (Dr Campbell)',
                'Nurse Moores Office'
            ])
        },
        {
            id: 'seed_d_2nd_floor_admin',
            name: '2nd Floor General Admin',
            icon: '🏛️',
            location: '2nd Floor General Administration',
            note: 'Second floor — General Administration',
            rooms: rooms([
                'Accountant Office / Accounts Department',
                'Administrator Office',
                'CEO (Chief Executive Officer) Office',
                'CEO Secretary Office',
                'Stationery Room',
                'Human Resource Management (HR)',
                'Senior HR Officer',
                'Kitchen',
                'Matrons Office',
                'Deputy Matrons Office',
                'Operations Manager',
                'Passage Way (2nd Floor)',
                'SMO & DNS Secretaries Office',
                'Senior Medical Officer (SMO)'
            ])
        }
    ];
}
