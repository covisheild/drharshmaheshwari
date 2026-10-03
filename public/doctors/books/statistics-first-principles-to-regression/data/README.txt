Datasets for "Statistics: From First Principles to Regression" (version 3.1)
Dr. Harsh Maheshwari - drharshmaheshwari.com

These are SYNTHETIC teaching data. No row describes a real person, child, woman, household, village or
district; names such as "District A", "PHC Urban" and every ID are invented.

How to use them
  Unzip so that the folder `data` sits in your R working directory. Then the book's code works as printed:
      cl <- read.csv("data/clinic_children.csv")
  Empty cells are missing values (NA in R). The files have no comment lines.

What is here
  *.csv          the datasets the In R boxes read (each book section that uses one is listed on the datasets page)
  make_data.R    the script that built them, with a fixed seed for every dataset. From the folder that holds
                 `data`, run: Rscript data/make_data.R (about 3 minutes; needs the survival package).
                 It writes every file except paired_hb_ifa.csv, a ten-row table typed by hand.
                 Several datasets are engineered so that a named model reproduces the book's printed numbers;
                 the script's header explains how.

Licence
  CC BY-NC-SA 4.0, the same as the book: free to copy, share and adapt for non-commercial use, with credit,
  under the same licence. https://creativecommons.org/licenses/by-nc-sa/4.0/
